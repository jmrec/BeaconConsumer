document.addEventListener('alpine:init', () => {
  Alpine.data('beaconApp', () => ({
    searchTerm: '',
    dateFilter: '',
    statusFilter: '',
    selectedItem: null,

    init() {
      console.log('Dashboard Component Initialized');
      this.handleUrlFocus();
    },

    get processedAnnouncements() {
      let list = [...Alpine.store('data').announcements];

      if (this.searchTerm || this.statusFilter) {
        list = list.filter((item) => {
          const searchStr = (
            item.cause +
            item.location +
            item.description +
            (item.feeders?.name || '')
          ).toLowerCase();
          const matchesSearch =
            !this.searchTerm || searchStr.includes(this.searchTerm.toLowerCase());
          const matchesStatus = !this.statusFilter || item.status === this.statusFilter;
          return matchesSearch && matchesStatus;
        });
      }

      // Sorting logic (User Barangay priority)
      const userBrgy = Alpine.store('auth').user?.barangay;
      return list.sort((a, b) => {
        const getScore = (item) => {
          const isRelevant = item.barangay === userBrgy;
          if (!isRelevant) return 0;
          return item.status === 'Reported' || item.status === 'Ongoing' ? 100 : 50;
        };
        return getScore(b) - getScore(a) || new Date(b.created_at) - new Date(a.created_at);
      });
    },

    openDetails(item) {
      this.selectedItem = item;
    },
    isUserArea(item) {
      return item.barangay === Alpine.store('auth').user?.barangay;
    },
    formatDate(d) {
      return new Date(d).toLocaleString([], {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    },
    formatStatus(status) {
      if (!status) return 'N/A';
      return status.charAt(0).toUpperCase() + status.slice(1);
    },
    getShortDescription(description) {
      if (!description) return 'No description';
      return description.length > 150 ? description.substring(0, 150) + '...' : description;
    },
    shareItem(item) {
      if (navigator.share) {
        navigator.share({
          title: item.cause,
          text: item.description,
          url: window.location.href + '?focus_announcement=' + item.id,
        });
      }
    },
    handleUrlFocus() {
      const params = new URLSearchParams(window.location.search);
      const focusId = params.get('focus_announcement');
      if (focusId) {
        setTimeout(() => {
          const el = document.getElementById('announcement-' + focusId);
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 500);
      }
    },
  }));
});
