const SUPABASE_URL = 'https://ziuteulziywsangbnkgn.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InppdXRldWx6aXl3c2FuZ2Jua2duIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE4NjQ4NDQsImV4cCI6MjA3NzQ0MDg0NH0.X2LkaDdouutbHWzotkMNEIdoJBfB9v1CtMQ7KZTXilk'; // replace with real key

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

document.addEventListener('alpine:init', () => {
  Alpine.store('data', {
    announcements: JSON.parse(localStorage.getItem('announcements_cache')) || [],
    reports: [],
    barangays: [],
    loading: { announcements: false, reports: false },
    channels: { announcements: null, reports: null },

    async init() {
      await this.getAnnouncements();
      this.subscribeToAnnouncements();
    },

    async getAnnouncements(force = false) {
      if (this.announcements.length > 0 && !force) return;
      this.loading.announcements = true;

      const { data, error } = await supabase
        .from('announcements')
        .select('*, feeders(name), announcement_images(image_url)')
        .order('created_at', { ascending: false });

      if (!error) {
        this.announcements = data;
        localStorage.setItem('announcements_cache', JSON.stringify(data));
      }
      this.loading.announcements = false;
    },

    subscribeToAnnouncements() {
      if (this.channels.announcements) return;
      this.channels.announcements = supabase
        .channel('dashboard-feed')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'announcements' },
          async (payload) => {
            if (payload.eventType === 'INSERT') {
              const { data } = await supabase
                .from('announcements')
                .select('*, feeders(name), announcement_images(image_url)')
                .eq('id', payload.new.id)
                .single();
              if (data) this.announcements.unshift(data);
            } else if (payload.eventType === 'UPDATE') {
              const idx = this.announcements.findIndex((a) => a.id === payload.new.id);
              if (idx !== -1)
                this.announcements[idx] = { ...this.announcements[idx], ...payload.new };
            } else if (payload.eventType === 'DELETE') {
              this.announcements = this.announcements.filter((a) => a.id !== payload.old.id);
            }
          }
        )
        .subscribe();
    },
  });

  Alpine.store('auth', {
    user: JSON.parse(localStorage.getItem('currentUser')) || null,
    isGuest: localStorage.getItem('guest') === 'true',
    async init() {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.user) await this.refreshProfile(session.user);

      supabase.auth.onAuthStateChange(async (event, session) => {
        if (session?.user) await this.refreshProfile(session.user);
        else this.clear();
      });
    },

    async refreshProfile(authUser) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', authUser.id)
        .single();
      this.user = {
        id: authUser.id,
        email: authUser.email,
        firstName: profile?.first_name || '',
        lastName: profile?.last_name || '',
        mobile: profile?.mobile || '',
        barangay: profile?.barangay || '',
        avatar: profile?.profile_picture || null,
        initials: (
          (profile?.first_name?.[0] || 'U') + (profile?.last_name?.[0] || '')
        ).toUpperCase(),
      };
      localStorage.setItem('currentUser', JSON.stringify(this.user));
    },

    clear() {
      this.user = null;
      this.isGuest = false;
      localStorage.clear();
    },
  });

  Alpine.store('ui', {
    profileModalOpen: false,
    alert: { show: false, message: '', type: 'info' },
    currentPage: window.location.pathname.split('/').pop() || 'index.html',

    showAlert(msg, type = 'info') {
      this.alert = { show: true, message: msg, type };
      if (type !== 'error') setTimeout(() => (this.alert.show = false), 3000);
    },
  });

  Alpine.data('mainShell', () => ({
    currentPage: 'dashboard',
    viewHtml: '',
    loadingPage: false,
    navItems: [
      { id: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
      { id: 'calendar', label: 'Calendar', icon: 'calendar_month' },
      { id: 'report', label: 'Report', icon: 'report' },
      { id: 'map', label: 'Map', icon: 'map' },
      { id: 'notification', label: 'Notifications', icon: 'notifications' },
    ],

    async init() {
      const urlParams = new URLSearchParams(window.location.search);
      const startPage = urlParams.get('p') || 'dashboard';
      await this.navigateTo(startPage, false);

      window.onpopstate = (e) => {
        if (e.state?.page) this.loadPage(e.state.page, false);
      };
    },

    toggleProfileMenu(event) {
      if (event) {
        event.preventDefault();
        event.stopPropagation();
      }
      this.profileMenuOpen = !this.profileMenuOpen;
      console.log('Profile Menu Toggled:', this.profileMenuOpen);
    },

    async navigateTo(pageId, push = true) {
      this.loadingPage = true;
      try {
        const response = await fetch(`${pageId}.html`);
        let html = await response.text();

        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const mainContent =
          doc.querySelector('main') || doc.querySelector('div[x-data]') || doc.body;

        this.$nextTick(() => {
          this.viewHtml = mainContent.outerHTML;
          this.currentPage = pageId;
        });

        if (push) {
          const newUrl = pageId === 'dashboard' ? '/' : `?p=${pageId}`;
          window.history.pushState({ page: pageId }, '', newUrl);
        }
        this.$nextTick(() => {
          console.log(`Page ${pageId} initialized and bound.`);
        });
      } catch (err) {
        console.error('Failed to load page:', err);
      } finally {
        this.loadingPage = false;
      }
    },
  }));
});
