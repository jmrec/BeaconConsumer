document.addEventListener('alpine:init', () => {
  Alpine.data('notificationApp', () => ({
    showSettings: false,
    readKeys: new Set(JSON.parse(localStorage.getItem('beacon_read_keys') || '[]')),
    prefs: JSON.parse(localStorage.getItem('beacon_notif_prefs')) || {
      pushScheduled: false,
      pushUnscheduled: false,
    },

    init() {
      this.$watch('readKeys', () => {
        localStorage.setItem('beacon_read_keys', JSON.stringify([...this.readKeys]));
      });
    },

    get filteredNotifications() {
      const userBrgy = Alpine.store('auth').user?.barangay?.toLowerCase();
      const announcements = Alpine.store('data').announcements;

      const processed = announcements
        .filter((item) => {
          if (!userBrgy) return true;
          const mainMatch = (item.barangay || '').toLowerCase().includes(userBrgy);
          const areaMatch =
            Array.isArray(item.areas_affected) &&
            item.areas_affected.some((a) => a.toLowerCase().includes(userBrgy));
          return mainMatch || areaMatch;
        })
        .map((item) => {
          const isScheduled = (item.type || '').toLowerCase() === 'scheduled';
          const isUrgent =
            isScheduled && item.scheduled_at && new Date(item.scheduled_at) > new Date();

          return {
            id: item.id,
            title: isUrgent ? `⚠️ Scheduled Maintenance` : item.cause || 'Power Outage',
            message: `${item.status}: ${item.location || item.barangay || 'Affected Area'}.`,
            timestamp: item.updated_at || item.created_at,
            isUrgent: isUrgent,
            isRead: this.readKeys.has(String(item.id)),
            type: isScheduled ? 'scheduled' : 'unscheduled',
          };
        });

      return processed.sort((a, b) => {
        if (a.isUrgent && !b.isUrgent) return -1;
        if (!a.isUrgent && b.isUrgent) return 1;
        return new Date(b.timestamp) - new Date(a.timestamp);
      });
    },

    routeToDashboard(notif) {
      this.readKeys.add(String(notif.id));
      localStorage.setItem('beacon_read_keys', JSON.stringify([...this.readKeys]));
      window.location.href = `index.html?focus_announcement=${notif.id}`;
    },

    markAllAsRead() {
      this.filteredNotifications.forEach((n) => this.readKeys.add(String(n.id)));
      localStorage.setItem('beacon_read_keys', JSON.stringify([...this.readKeys]));
    },

    saveReadKeys() {
      localStorage.setItem('beacon_read_keys', JSON.stringify([...this.readKeys]));
    },

    savePrefs() {
      localStorage.setItem('beacon_notif_prefs', JSON.stringify(this.prefs));
    },

    async requestPushPermission() {
      if ('Notification' in window) {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
          Alpine.store('ui').showAlert('Push notifications enabled!');
        }
      }
    },

    triggerBrowserPushes() {
      // Browser push logic... (same as your original sendBrowserNotification)
    },

    formatTime(ts) {
      return new Date(ts).toLocaleString([], {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    },
  }));
});
