const functions = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();

// Send notification to admin/owner when new member requests approval
exports.onMemberCreated = functions.firestore
  .document('owners/{ownerId}/members/{memberId}')
  .onCreate(async (snap, context) => {
    const member = snap.data();
    
    // Only notify for pending members
    if (member.status !== 'pending') return null;
    
    // Get owner's FCM tokens
    const ownerDoc = await admin.firestore()
      .collection('owners')
      .doc(context.params.ownerId)
      .get();
    
    if (!ownerDoc.exists) return null;
    
    const owner = ownerDoc.data();
    
    // Get FCM tokens for this owner
    const tokensSnapshot = await admin.firestore()
      .collection('fcmTokens')
      .where('uid', '==', context.params.ownerId)
      .get();
    
    if (tokensSnapshot.empty) return null;
    
    const tokens = tokensSnapshot.docs.map(doc => doc.data().token);
    
    // Send push notification
    const message = {
      notification: {
        title: '👤 New Member Approval Request',
        body: `${member.name} is requesting approval`,
        icon: '/icons/icon-192.png'
      },
      data: {
        type: 'member-approval',
        memberId: context.params.memberId,
        ownerId: context.params.ownerId
      },
      tokens: tokens
    };
    
    try {
      const response = await admin.messaging().sendMulticast(message);
      // console.log('Successfully sent approval notification:', response);
      
      // Update notification count in adminNotifications
      await admin.firestore()
        .collection('adminNotifications')
        .doc(context.params.ownerId)
        .set({
          pendingApprovals: admin.firestore.FieldValue.increment(1),
          lastUpdated: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
      
      return response;
    } catch (error) {
      console.error('Error sending approval notification:', error);
      return null;
    }
  });

// Send notification for payment dues
exports.checkPaymentDues = functions.pubsub
  .schedule('every 24 hours')
  .onRun(async (context) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Get all active owners
    const ownersSnapshot = await admin.firestore()
      .collection('owners')
      .where('status', '==', 'approved')
      .get();
    
    for (const ownerDoc of ownersSnapshot.docs) {
      const ownerId = ownerDoc.id;
      
      // Get members with dues due today or overdue
      const membersSnapshot = await admin.firestore()
        .collection('owners')
        .doc(ownerId)
        .collection('members')
        .where('status', '==', 'active')
        .where('dueDate', '<=', admin.firestore.Timestamp.fromDate(today))
        .get();
      
      if (membersSnapshot.empty) continue;
      
      const urgentDues = [];
      
      for (const memberDoc of membersSnapshot.docs) {
        const member = memberDoc.data();
        const dueDate = member.dueDate.toDate();
        const daysOverdue = Math.floor((today - dueDate) / (1000 * 60 * 60 * 24));
        
        // Only notify for dues due today or up to 7 days overdue
        if (daysOverdue >= 0 && daysOverdue <= 7) {
          urgentDues.push({
            memberId: memberDoc.id,
            memberName: member.name,
            dueDate: member.dueDate,
            daysOverdue: daysOverdue
          });
        }
      }
      
      if (urgentDues.length === 0) continue;
      
      // Get FCM tokens for this owner
      const tokensSnapshot = await admin.firestore()
        .collection('fcmTokens')
        .where('uid', '==', ownerId)
        .get();
      
      if (tokensSnapshot.empty) continue;
      
      const tokens = tokensSnapshot.docs.map(doc => doc.data().token);
      
      // Send push notification
      const message = {
        notification: {
          title: '💳 Payment Due Alert',
          body: `${urgentDues.length} member(s) have payment due today or overdue`,
          icon: '/icons/icon-192.png'
        },
        data: {
          type: 'payment-due-summary',
          count: urgentDues.length.toString()
        },
        tokens: tokens
      };
      
      try {
        const response = await admin.messaging().sendMulticast(message);
        // console.log(`Successfully sent due notification to owner ${ownerId}:`, response);
        
        // Update urgent notifications
        await admin.firestore()
          .collection('urgentNotifications')
          .doc(ownerId)
          .set({
            urgentDues: urgentDues,
            lastUpdated: admin.firestore.FieldValue.serverTimestamp()
          }, { merge: true });
        
      } catch (error) {
        console.error(`Error sending due notification to owner ${ownerId}:`, error);
      }
    }
    
    return null;
  });

// Send notification when payment is received
exports.onPaymentReceived = functions.firestore
  .document('owners/{ownerId}/payments/{paymentId}')
  .onCreate(async (snap, context) => {
    const payment = snap.data();
    
    // Get member details
    const memberDoc = await admin.firestore()
      .collection('owners')
      .doc(context.params.ownerId)
      .collection('members')
      .doc(payment.memberId)
      .get();
    
    if (!memberDoc.exists) return null;
    
    const member = memberDoc.data();
    
    // Get FCM tokens for this owner
    const tokensSnapshot = await admin.firestore()
      .collection('fcmTokens')
      .where('uid', '==', context.params.ownerId)
      .get();
    
    if (tokensSnapshot.empty) return null;
    
    const tokens = tokensSnapshot.docs.map(doc => doc.data().token);
    
    // Send push notification
    const message = {
      notification: {
        title: '💰 Payment Received',
        body: `${member.name} paid ₹${payment.amount}`,
        icon: '/icons/icon-192.png'
      },
      data: {
        type: 'payment-received',
        memberId: payment.memberId,
        amount: payment.amount.toString()
      },
      tokens: tokens
    };
    
    try {
      const response = await admin.messaging().sendMulticast(message);
      // console.log('Successfully sent payment notification:', response);
      return response;
    } catch (error) {
      console.error('Error sending payment notification:', error);
      return null;
    }
  });

// --- Member PWA install (QR + mobile) + owner → member push broadcasts ---

function normalizeDigits10(raw) {
  const d = String(raw || '').replace(/\D/g, '');
  return d.length >= 10 ? d.slice(-10) : d;
}

async function findMemberDocByOwnerAndMobile(db, ownerId, rawMobile) {
  const digits = normalizeDigits10(rawMobile);
  if (digits.length !== 10) return null;
  const variants = [
    digits,
    `+91${digits}`,
    `91${digits}`,
    `+91 ${digits}`,
    `91 ${digits}`,
  ];
  const snaps = await Promise.all(
    variants.map((v) =>
      db.collection('members').where('ownerId', '==', ownerId).where('mobile', '==', v).limit(1).get(),
    ),
  );
  for (const q of snaps) {
    if (!q.empty) return q.docs[0];
  }
  const all = await db.collection('members').where('ownerId', '==', ownerId).limit(400).get();
  for (const doc of all.docs) {
    if (normalizeDigits10(doc.get('mobile')) === digits) return doc;
  }
  return null;
}

/**
 * Public callable (no prior auth). Validates QR install doc + member mobile, returns Firebase custom token.
 * Deploy functions and enable Authentication (Custom) for this to work.
 *
 * Higher timeout + memory: member lookup and cold starts can otherwise hit gateway 504s.
 */
exports.verifyMemberForApp = functions
  .runWith({ timeoutSeconds: 120, memory: '512MB' })
  .https.onCall(async (data) => {
    const started = Date.now();
    const installCode = String(data.installCode || '');
    const ownerId = String(data.ownerId || '');
    const mobile = data.mobile;
    if (!installCode || !ownerId) {
      throw new functions.https.HttpsError('invalid-argument', 'installCode and ownerId are required');
    }
    const db = admin.firestore();
    try {
      const codeSnap = await db.collection('memberInstallQrCodes').doc(installCode).get();
      const c = codeSnap.data() || {};
      if (!codeSnap.exists || c.active !== true || c.ownerId !== ownerId) {
        throw new functions.https.HttpsError('permission-denied', 'Invalid or inactive install link');
      }
      const memberDoc = await findMemberDocByOwnerAndMobile(db, ownerId, mobile);
      if (!memberDoc || !memberDoc.exists) {
        throw new functions.https.HttpsError(
          'not-found',
          'This mobile number is not on file for this property. Ask the owner to add you first.',
        );
      }
      const memberId = memberDoc.id;
      const actRef = db.collection('memberAppActivations').doc(memberId);

      let alreadyActivated = false;
      await db.runTransaction(async (t) => {
        const act = await t.get(actRef);
        if (act.exists) {
          alreadyActivated = true;
          return;
        }
        t.set(actRef, {
          ownerId,
          memberId,
          installCode,
          activatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      });

      if (alreadyActivated) {
        throw new functions.https.HttpsError(
          'failed-precondition',
          'This member number is already linked to the app. Open the app from your home screen. New sign-ups on another phone are not allowed.',
        );
      }

      const ownerSnap = await db.collection('owners').doc(ownerId).get();
      const od = ownerSnap.data() || {};
      const ownerBusinessName = String(od.businessName || od.name || 'Your property').slice(0, 120);
      const md = memberDoc.data() || {};
      const memberDisplayName = `${String(md.firstName || 'Member').trim()} ${String(md.lastName || '').trim()}`
        .trim()
        .slice(0, 120);
      let customToken;
      try {
        customToken = await admin.auth().createCustomToken(`memapp_${memberId}`, {
          role: 'member_app',
          ownerId,
          memberId,
          ownerBusinessName,
          memberDisplayName,
        });
      } catch (tokenErr) {
        await actRef.delete().catch(() => {});
        functions.logger.error('verifyMemberForApp createCustomToken failed', tokenErr, { ownerId, memberId });
        throw new functions.https.HttpsError(
          'internal',
          'Could not issue login. Please try again or contact support.',
        );
      }
      functions.logger.info('verifyMemberForApp ok', { ownerId, memberId, ms: Date.now() - started });
      return { customToken };
    } catch (e) {
      if (e instanceof functions.https.HttpsError) throw e;
      functions.logger.error('verifyMemberForApp failed', e, { ownerId, ms: Date.now() - started });
      throw new functions.https.HttpsError(
        'internal',
        'Could not complete sign-in. Please try again in a moment or ask the owner to check Cloud Functions logs.',
      );
    }
  });

/** When a member submits self-onboarding (public, no auth), notify the owner in-app. */
exports.onMemberProfilePendingReview = functions.firestore
  .document('members/{memberId}')
  .onUpdate(async (change, context) => {
    const before = change.before.data() || {};
    const after = change.after.data() || {};
    if (after.selfOnboardingStatus !== 'pending_review') return null;
    if (before.selfOnboardingStatus === 'pending_review') return null;
    const ownerId = after.ownerId;
    if (!ownerId) return null;
    const first = String(after.firstName || 'Member').trim();
    const last = String(after.lastName || '').trim();
    const name = `${first} ${last}`.trim();
    await admin.firestore().collection('owners').doc(ownerId).collection('appNotifications').add({
      title: 'Profile pending review',
      body: `${name} submitted details for your approval.`,
      category: 'profile_review',
      read: false,
      memberId: context.params.memberId,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return null;
  });

/** Push notification for owner/admin chat so it works even when app is closed. */
exports.onChatMessageCreated = functions.firestore
  .document('chats/{chatId}/messages/{messageId}')
  .onCreate(async (snap, context) => {
    const msg = snap.data() || {};
    const chatId = String(context.params.chatId || '');
    const senderRole = String(msg.senderRole || '').toLowerCase();
    const senderId = String(msg.senderId || '');
    const senderName = String(msg.senderName || '').trim() || (senderRole === 'admin' ? 'Admin' : 'Owner');
    const text = String(msg.text || '').trim();
    if (!chatId || !senderRole) return null;

    const db = admin.firestore();
    let tokensSnap;

    if (senderRole === 'owner') {
      // Owner -> Admin chat: notify all admin devices.
      tokensSnap = await db.collection('fcmTokens').where('role', '==', 'admin').get();
    } else if (senderRole === 'admin') {
      // Admin -> Owner chat: notify the owner tied to this chat thread.
      tokensSnap = await db.collection('fcmTokens').where('uid', '==', chatId).get();
    } else {
      return null;
    }

    if (!tokensSnap || tokensSnap.empty) return null;
    const tokens = tokensSnap.docs
      .map((d) => d.data() || {})
      .filter((d) => d.uid !== senderId)
      .map((d) => d.token)
      .filter((t) => typeof t === 'string' && t.length > 0);
    if (!tokens.length) return null;

    const message = {
      notification: {
        title: senderRole === 'owner' ? 'New owner message' : 'New admin message',
        body: text ? `${senderName}: ${text.slice(0, 280)}` : `${senderName} sent a message`,
        icon: '/icons/icon-192.png',
      },
      data: {
        type: 'owner-admin-chat',
        chatId,
        senderRole,
      },
      tokens,
    };

    try {
      return await admin.messaging().sendMulticast(message);
    } catch (e) {
      console.error('onChatMessageCreated', e);
      return null;
    }
  });

exports.onOwnerBroadcastCreated = functions.firestore
  .document('owners/{ownerId}/broadcasts/{broadcastId}')
  .onCreate(async (snap, context) => {
    const d = snap.data() || {};
    const title = d.title ? String(d.title) : 'Message from your owner';
    const body = d.body ? String(d.body) : '';
    const ownerId = context.params.ownerId;
    const tokensSnap = await admin.firestore()
      .collection('owners')
      .doc(ownerId)
      .collection('memberDeviceTokens')
      .get();
    const tokens = tokensSnap.docs.map((x) => x.data().token).filter(Boolean);
    if (!tokens.length) return null;
    const message = {
      notification: {
        title,
        body: body.slice(0, 400),
        icon: '/icons/icon-192.png',
      },
      data: {
        type: 'owner-broadcast',
        ownerId,
      },
      tokens,
    };
    try {
      return await admin.messaging().sendMulticast(message);
    } catch (e) {
      console.error('onOwnerBroadcastCreated', e);
      return null;
    }
  });
