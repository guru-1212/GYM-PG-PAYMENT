// Custom service worker for Firebase Cloud Messaging
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-messaging-compat.js');

// Initialize Firebase in the service worker
firebase.initializeApp({
  apiKey: "AIzaSyCGNjCt4L_O8I1c0r_s_ds3LF-FmU9wQr0",
  authDomain: "test-gym-pg-sass.firebaseapp.com",
  projectId: "test-gym-pg-sass",
  storageBucket: "test-gym-pg-sass.firebasestorage.app",
  messagingSenderId: "445355373149",
  appId: "1:445355373149:web:19b106c0513cae0c21d3b4",
  measurementId: "G-EQJGVFD2LK"
});

const messaging = firebase.messaging();

// Handle background messages
messaging.onBackgroundMessage((payload) => {
  // console.log('Received background message:', payload);

  const notificationTitle = payload.notification?.title || 'New Notification';
  const notificationOptions = {
    body: payload.notification?.body || '',
    icon: payload.notification?.icon || '/icons/Brand_LOGO_New.png',
    badge: '/icons/Brand_LOGO_New.png',
    tag: payload.tag || 'default',
    data: payload.data,
    requireInteraction: true,
    actions: [
      {
        action: 'view',
        title: 'View Details'
      },
      {
        action: 'dismiss',
        title: 'Dismiss'
      }
    ]
  };

  // Show the notification
  self.registration.showNotification(notificationTitle, notificationOptions);
});

// Handle notification click
self.addEventListener('notificationclick', (event) => {
  // console.log('Notification clicked:', event);

  event.notification.close();

  // Handle different actions
  if (event.action === 'dismiss') {
    return;
  }

  // Get the notification data
  const data = event.notification.data || {};
  const notificationType = data.type;

  // Determine the URL to open based on notification type
  let urlToOpen = '/';
  
  if (notificationType === 'member-approval') {
    urlToOpen = '/members?filter=pending';
  } else if (notificationType === 'payment-due' && data.memberId) {
    urlToOpen = `/members/${data.memberId}`;
  } else if (notificationType === 'payment-received') {
    urlToOpen = '/payments';
  }

  // Open the app and navigate to the relevant page
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Focus existing window if available
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus().then((focusedClient) => {
            focusedClient.postMessage({
              type: 'NAVIGATE',
              url: urlToOpen
            });
            return focusedClient.navigate(urlToOpen);
          });
        }
      }
      
      // Open new window if no existing window
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});

// Handle notification close
self.addEventListener('notificationclose', (event) => {
  // console.log('Notification closed:', event);
});

// Push event handler for additional push functionality
self.addEventListener('push', (event) => {
  // console.log('Push event received:', event);
  
  if (!event.data) {
    return;
  }

  const data = event.data.json();
  
  // Only show notifications for admin/owner users
  // This is a basic check - in production, you'd want better authentication
  if (data.targetRole && (data.targetRole === 'admin' || data.targetRole === 'owner')) {
    const title = data.title || 'New Notification';
    const options = {
      body: data.body || '',
      icon: data.icon || '/icons/Brand_LOGO_New.png',
      badge: '/icons/Brand_LOGO_New.png',
      tag: data.tag || 'default',
      data: data.data || {},
      requireInteraction: data.requireInteraction || false,
      actions: data.actions || []
    };

    event.waitUntil(
      self.registration.showNotification(title, options)
    );
  }
});
