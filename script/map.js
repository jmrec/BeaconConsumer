// ==============================
// Map Functions (ADD TO EXISTING CODE)
// ==============================

// Initialize Map
function initializeMap() {
    if (!document.getElementById('map')) return;
    
    // Initialize Leaflet map (using your existing code)
    const map = L.map('map').setView([16.4142, 120.5950], 13);

    // Add OpenStreetMap tiles
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    // Setup mobile-friendly controls
    setupMapControls(map);
    
    // Load announcements with coordinates
    loadMapAnnouncements(map);
    
    // Subscribe to real-time updates
    subscribeToMapUpdates(map);

    // Optional: user location (your existing code)
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            function(position) {
                const lat = position.coords.latitude;
                const lng = position.coords.longitude;
                L.marker([lat, lng]).addTo(map)
                    .bindPopup("You are here").openPopup();
                map.setView([lat, lng], 14);
            },
            function(error) {
                console.log("Geolocation error:", error);
            }
        );
    }

    return map;
}

// Setup mobile-friendly map controls
function setupMapControls(map) {
    // Mobile view: replace filter button with icon
    const filterButton = document.querySelector('#map-page .filter-button');
    if (filterButton && window.innerWidth <= 768) {
        filterButton.innerHTML = '<span class="material-symbols-outlined">filter_list</span>';
        filterButton.style.padding = '8px';
        filterButton.style.minWidth = 'auto';
    }

    // Search functionality (your existing code)
    const searchInput = document.getElementById('locationSearch');
    if (searchInput) {
        searchInput.addEventListener('keyup', function(e) {
            if (e.key === 'Enter') {
                const query = searchInput.value.trim();
                if (query) {
                    searchLocation(query, map);
                }
            }
        });
    }

    // Filter functionality (your existing code)
    const areaSelector = document.getElementById('area-selector');
    if (areaSelector) {
        areaSelector.addEventListener('change', function() {
            updateMapDisplay(this.value, map);
        });
    }
}

// Load announcements for map
async function loadMapAnnouncements(map) {
    try {
        // Only load announcements with coordinates and active status
        const { data, error } = await supabase
            .from("announcements")
            .select("*, feeders ( name )")
            .not('latitude', 'is', null)
            .not('longitude', 'is', null)
            .in('status', ['reported', 'ongoing'])
            .order("created_at", { ascending: false });

        if (error) throw error;

        // Clear existing markers (except user location)
        map.eachLayer((layer) => {
            if (layer instanceof L.Marker && !layer._popup || layer._popup?.getContent() !== "You are here") {
                map.removeLayer(layer);
            }
        });

        // Add markers to map with offset to prevent overlap
        data.forEach((announcement, index) => {
            if (announcement.latitude && announcement.longitude) {
                // Apply slight offset based on index to prevent marker overlap
                const offset = index * 0.0001;
                const lat = announcement.latitude + offset;
                const lng = announcement.longitude + offset;

                // Choose marker color based on status
                const markerColor = announcement.status === 'ongoing' ? 'orange' : 'red';
                
                // Create custom icon
                const customIcon = L.divIcon({
                    className: `custom-marker ${announcement.status}`,
                    html: `
                        <div style="
                            background-color: ${markerColor};
                            width: 20px;
                            height: 20px;
                            border-radius: 50%;
                            border: 3px solid white;
                            box-shadow: 0 2px 4px rgba(0,0,0,0.3);
                            cursor: pointer;
                        "></div>
                    `,
                    iconSize: [20, 20],
                    iconAnchor: [10, 10]
                });

                const marker = L.marker([lat, lng], { icon: customIcon })
                    .addTo(map)
                    .bindPopup(`
                        <div style="min-width: 200px;">
                            <h4 style="margin: 0 0 8px 0;">${announcement.cause || 'Power Outage'}</h4>
                            <p style="margin: 4px 0;"><strong>Location:</strong> ${announcement.location || 'N/A'}</p>
                            <p style="margin: 4px 0;"><strong>Status:</strong> <span class="status-${announcement.status}">${formatStatus(announcement.status)}</span></p>
                            <p style="margin: 4px 0;"><strong>Barangay:</strong> ${announcement.barangay || 'N/A'}</p>
                            <button onclick="showAnnouncementDetails(${announcement.id})" style="
                                background: #f1c40f;
                                border: none;
                                padding: 8px 16px;
                                border-radius: 4px;
                                color: white;
                                cursor: pointer;
                                margin-top: 8px;
                                width: 100%;
                            ">View Details</button>
                        </div>
                    `);

                // Open modal on marker click
                marker.on('click', () => {
                    showAnnouncementDetails(announcement.id);
                });
            }
        });

    } catch (err) {
        console.error("Error loading map announcements:", err);
    }
}

// Subscribe to map updates
function subscribeToMapUpdates(map) {
    if (window.mapSubscriptionChannel) {
        return;
    }
  
    console.log("📡 Subscribing to map announcements...");

    window.mapSubscriptionChannel = supabase
        .channel('public:map_announcements')
        .on(
            'postgres_changes',
            { 
                event: '*',
                schema: 'public',
                table: 'announcements',
                filter: 'status=in.(reported,ongoing)'
            },
            (payload) => {
                console.log('✅ Realtime map update received!', payload);
                loadMapAnnouncements(map);
            }
        )
        .subscribe((status, err) => {
            if (status === 'SUBSCRIBED') {
                console.log('✅ Successfully subscribed to map updates!');
            }
            if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                console.error('Subscription error:', err);
                supabase.removeChannel(window.mapSubscriptionChannel);
                window.mapSubscriptionChannel = null;
            }
        });
}

// Update map display based on filter (your existing function)
function updateMapDisplay(selectedArea, map) {
    console.log('Selected area:', selectedArea);
    // TODO: add your logic to filter markers based on the selected feeder/area
    // For now, just reload all announcements
    loadMapAnnouncements(map);
}

// Search location using Nominatim (your existing function)
function searchLocation(query, map) {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`;
    fetch(url)
        .then(res => res.json())
        .then(data => {
            if (data && data.length > 0) {
                const firstResult = data[0];
                const lat = parseFloat(firstResult.lat);
                const lon = parseFloat(firstResult.lon);
                map.setView([lat, lon], 16);

                L.marker([lat, lon]).addTo(map)
                    .bindPopup(firstResult.display_name)
                    .openPopup();
            } else {
                alert("Location not found.");
            }
        })
        .catch(err => console.error("Search error:", err));
}

// Update your existing DOMContentLoaded to initialize map
document.addEventListener("DOMContentLoaded", function() {
    // Initialize map (your existing code)
    const map = L.map('map').setView([16.4142, 120.5950], 13);

    // Add OpenStreetMap tiles
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    // Setup mobile-friendly controls
    setupMapControls(map);
    
    // Load announcements with coordinates
    loadMapAnnouncements(map);
    
    // Subscribe to real-time updates
    subscribeToMapUpdates(map);

    // Optional: user location (your existing code)
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            function(position) {
                const lat = position.coords.latitude;
                const lng = position.coords.longitude;
                L.marker([lat, lng]).addTo(map)
                    .bindPopup("You are here").openPopup();
                map.setView([lat, lng], 14);
            },
            function(error) {
                console.log("Geolocation error:", error);
            }
        );
    }

    // Area selector logic (your existing code)
    const areaSelector = document.getElementById('area-selector');
    if (areaSelector) {
        areaSelector.addEventListener('change', function() {
            updateMapDisplay(this.value, map);
        });
    }

    // Optional: search box logic (your existing code)
    const searchInput = document.getElementById('locationSearch');
    if (searchInput) {
        searchInput.addEventListener('keyup', function(e) {
            if (e.key === 'Enter') {
                const query = searchInput.value.trim();
                if (query) {
                    searchLocation(query, map);
                }
            }
        });
    }
});

// Update Page Switcher to handle map page
function showPage(pageId) {
    // Unsubscribe from dashboard if leaving it
    if (pageId !== 'dashboard' && dashboardSubscriptionChannel) {
        console.log("Leaving dashboard, unsubscribing from updates.");
        supabase.removeChannel(dashboardSubscriptionChannel);
        dashboardSubscriptionChannel = null;
    }
    
    // Unsubscribe from map if leaving it
    if (pageId !== 'map-page' && window.mapSubscriptionChannel) {
        console.log("Leaving map, unsubscribing from updates.");
        supabase.removeChannel(window.mapSubscriptionChannel);
        window.mapSubscriptionChannel = null;
    }

    document.querySelectorAll(".page").forEach((p) => p.classList.remove("active"));
    const newPage = document.getElementById(pageId);
    if (newPage) {
        newPage.classList.add("active");
    }
    
    // Call initializer for the specific page being shown
    if (pageId === "report-form") {
        initializeReportForm();
    } else if (pageId === "dashboard") {
        initializeDashboard();
    } else if (pageId === "map-page") {
        // Map is already initialized in DOMContentLoaded
        // Just ensure it's visible and reload data
        const mapElement = document.getElementById('map');
        if (mapElement && mapElement._leaflet_id) {
            const map = L.Map.prototype.get(mapElement._leaflet_id);
            if (map) {
                setTimeout(() => {
                    map.invalidateSize();
                    loadMapAnnouncements(map);
                }, 100);
            }
        }
    }
}