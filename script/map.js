document.addEventListener('alpine:init', () => {
  Alpine.data('mapApp', () => ({
    map: null,
    mapReady: false,
    markers: [],
    selectedOutage: null,

    // Search & Filter
    searchQuery: '',
    selectedFeeder: 'all',
    showDropdown: false,
    barangayNames: [],
    filteredBrgyList: [],

    async init() {
      // 1. Wait for HTML injection
      this.$nextTick(async () => {
        await this.initLeaflet();
        await this.loadBarangayList();
        await this.loadAndPlot();
        this.handleRedirects();
      });
    },

    async initLeaflet() {
      // Small timeout to ensure container has dimensions
      await new Promise((r) => setTimeout(r, 100));

      this.map = L.map('map').setView([16.4142, 120.595], 13);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap',
      }).addTo(this.map);

      this.mapReady = true;
    },

    async loadBarangayList() {
      const { data } = await supabase.from('barangays').select('name').order('name');
      this.barangayNames = data.map((b) => b.name);
    },

    async loadAndPlot() {
      try {
        let query = supabase
          .from('announcements')
          .select('*')
          .not('latitude', 'is', null)
          .in('status', ['Reported', 'Ongoing']);

        if (this.selectedFeeder !== 'all') {
          query = query.eq('feeder_id', this.selectedFeeder);
        }

        const { data, error } = await query;
        if (error) throw error;

        // Clear existing markers
        this.markers.forEach((m) => this.map.removeLayer(m));
        this.markers = [];

        data.forEach((report, index) => {
          const color = report.status === 'Ongoing' ? '#FFC107' : '#DC3545';
          const icon = this.createIcon(color);

          // Basic jitter logic if coordinates are identical
          const lat = Number(report.latitude) + index * 0.0001;
          const lng = Number(report.longitude) + index * 0.0001;

          const marker = L.marker([lat, lng], { icon }).addTo(this.map);

          marker.on('click', () => {
            this.selectedOutage = report;
          });

          this.markers.push(marker);
        });

        // Auto-zoom to fit all markers
        if (this.markers.length > 0) {
          const group = L.featureGroup(this.markers);
          this.map.fitBounds(group.getBounds().pad(0.2));
        }
      } catch (err) {
        console.error('Map plot error:', err);
      }
    },

    createIcon(color) {
      return L.divIcon({
        className: 'custom-marker',
        html: `<div style="background:${color}; width:20px; height:20px; border-radius:50%; border:2px solid white; box-shadow:0 2px 5px rgba(0,0,0,0.3)"></div>`,
        iconSize: [20, 20],
      });
    },

    filterBarangays() {
      if (this.searchQuery.length < 2) {
        this.showDropdown = false;
        return;
      }
      this.filteredBrgyList = this.barangayNames
        .filter((b) => b.toLowerCase().includes(this.searchQuery.toLowerCase()))
        .slice(0, 5);
      this.showDropdown = this.filteredBrgyList.length > 0;
    },

    async selectBarangay(name) {
      this.searchQuery = name;
      this.showDropdown = false;

      // Look for a report in this barangay
      const { data } = await supabase
        .from('announcements')
        .select('*')
        .ilike('barangay', `%${name}%`)
        .in('status', ['Reported', 'Ongoing'])
        .limit(1)
        .single();

      if (data && data.latitude) {
        this.map.setView([data.latitude, data.longitude], 16);
        this.selectedOutage = data;
      } else {
        Alpine.store('ui').showAlert(`No active outages in ${name}`, 'info');
      }
    },

    handleRedirects() {
      const urlParams = new URLSearchParams(window.location.search);
      const id = urlParams.get('id');
      if (id) {
        // Zoom into the specific marker from the dashboard
        // Handled by the data fetch and fitting bounds usually,
        // but you can add specific logic here to find marker by ID.
      }
    },
  }));
});
