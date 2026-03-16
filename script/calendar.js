document.addEventListener('alpine:init', () => {
  Alpine.data('calendarApp', () => ({
    currentMonth: new Date().getMonth(),
    currentYear: new Date().getFullYear(),
    selectedDate: new Date(),
    allScheduledOutages: [],
    isLoading: true,
    monthNames: [
      'January',
      'February',
      'March',
      'April',
      'May',
      'June',
      'July',
      'August',
      'September',
      'October',
      'November',
      'December',
    ],

    async init() {
      await this.fetchScheduledOutages();

      // Watch for auth changes to re-filter if the user's barangay changes
      this.$watch('$store.auth.user', () => {
        this.fetchScheduledOutages();
      });
    },

    async fetchScheduledOutages() {
      this.isLoading = true;
      try {
        const { data, error } = await supabase
          .from('announcements')
          .select('*')
          .eq('type', 'scheduled')
          .not('status', 'ilike', 'completed')
          .not('scheduled_at', 'is', null)
          .order('scheduled_at', { ascending: true });

        if (error) throw error;

        // Filter by User Barangay via Global Store
        const userBrgy = Alpine.store('auth').user?.barangay?.toLowerCase();

        this.allScheduledOutages = (data || []).filter((outage) => {
          if (!userBrgy || userBrgy === 'not set') return true;

          const mainMatch = (outage.barangay || '').toLowerCase().includes(userBrgy);
          const areaMatch =
            Array.isArray(outage.areas_affected) &&
            outage.areas_affected.some((area) => area.toLowerCase().includes(userBrgy));

          return mainMatch || areaMatch;
        });
      } catch (err) {
        console.error('💥 Calendar Fetch error:', err);
      } finally {
        this.isLoading = false;
      }
    },

    // Computed-like logic for the grid
    get blankDays() {
      const firstDay = new Date(this.currentYear, this.currentMonth, 1).getDay();
      return Array.from({ length: firstDay });
    },

    get daysInMonth() {
      const daysCount = new Date(this.currentYear, this.currentMonth + 1, 0).getDate();
      const today = new Date();

      return Array.from({ length: daysCount }, (_, i) => {
        const d = i + 1;
        const date = new Date(this.currentYear, this.currentMonth, d);
        return {
          dayNum: d,
          date: date,
          dateString: date.toDateString(),
          isToday: this.isSameDay(date, today),
          outages: this.allScheduledOutages.filter((o) =>
            this.isSameDay(new Date(o.scheduled_at), date)
          ),
        };
      });
    },

    get selectedDateOutages() {
      return this.allScheduledOutages.filter((o) =>
        this.isSameDay(new Date(o.scheduled_at), this.selectedDate)
      );
    },

    // Actions
    changeMonth(offset) {
      this.currentMonth += offset;
      if (this.currentMonth < 0) {
        this.currentMonth = 11;
        this.currentYear--;
      } else if (this.currentMonth > 11) {
        this.currentMonth = 0;
        this.currentYear++;
      }
    },

    goToToday() {
      const today = new Date();
      this.currentMonth = today.getMonth();
      this.currentYear = today.getFullYear();
      this.selectedDate = today;
    },

    selectDate(date) {
      this.selectedDate = date;
    },

    // Helpers
    isSameDay(d1, d2) {
      return (
        d1.getFullYear() === d2.getFullYear() &&
        d1.getMonth() === d2.getMonth() &&
        d1.getDate() === d2.getDate()
      );
    },

    isSelected(date) {
      return this.isSameDay(date, this.selectedDate);
    },

    getDetailsTitle() {
      const options = { month: 'long', day: 'numeric', year: 'numeric' };
      return this.isSameDay(this.selectedDate, new Date())
        ? "Today's Schedule"
        : `Schedule for ${this.selectedDate.toLocaleDateString('en-US', options)}`;
    },

    formatTime(ts) {
      return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    },
  }));
});
