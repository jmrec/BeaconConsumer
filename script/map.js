document.addEventListener("DOMContentLoaded", function() {
    // Initialize map
    const map = L.map('map').setView([16.4142, 120.5950], 13); // Baguio center

    // Add OpenStreetMap tiles
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    // Optional: user location
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

    // Area selector logic
    const areaSelector = document.getElementById('area-selector');
    if (areaSelector) {
        areaSelector.addEventListener('change', function() {
            updateMapDisplay(this.value, map);
        });
    }

    // Optional: search box logic
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

// Update map based on area selector
function updateMapDisplay(selectedArea, map) {
    console.log('Selected area:', selectedArea);
    // TODO: add your logic to filter markers based on the selected feeder/area
    // Example: show/hide markers or move map center
}

// Search location using Nominatim
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
