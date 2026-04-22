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
      console.log('Successfully sent approval notification:', response);
      
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
        console.log(`Successfully sent due notification to owner ${ownerId}:`, response);
        
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
      console.log('Successfully sent payment notification:', response);
      return response;
    } catch (error) {
      console.error('Error sending payment notification:', error);
      return null;
    }
  });
