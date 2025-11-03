// ==============================
// Wait for Supabase Initialization
// ==============================
async function waitForSupabase() {
  let retries = 0;
  while ((!window.supabase || typeof window.supabase.from !== "function") && retries < 30) {
    await new Promise((r) => setTimeout(r, 200));
    retries++;
  }
  if (!window.supabase || typeof window.supabase.from !== "function") {
    console.error("❌ Supabase failed to initialize after waiting.");
    throw new Error("Supabase not ready");
  }
  console.log("✅ Supabase is ready");
}

// ==============================
// Populate Barangay Dropdown
// ==============================
async function loadBarangays() {
  const barangaySelect = document.getElementById("barangay-select");
  if (!barangaySelect) return;

  barangaySelect.innerHTML = `<option value="">Loading barangays...</option>`;

  try {
    await waitForSupabase();
    const { data, error } = await supabase.from("barangays").select("*").order("name", { ascending: true });
    if (error) throw error;

    barangaySelect.innerHTML = `<option value="">Select Barangay</option>`;
    data.forEach((barangay) => {
      const option = document.createElement("option");
      option.value = barangay.id;
      option.textContent = barangay.name;
      barangaySelect.appendChild(option);
    });
    console.log("✅ Barangays loaded:", data.length);
  } catch (err) {
    console.error("Error loading barangays:", err);
    barangaySelect.innerHTML = `<option value="">Failed to load</option>`;
  }
}

// ==============================
// Initialize Report Page
// ==============================
document.addEventListener("DOMContentLoaded", async () => {
  await waitForSupabase();
  await loadBarangays();
  loadUserReports();
  initializeReportForm();
  setupCloseButtons();
});

// ==============================
// Load Reports for Logged-in User
// ==============================
async function loadUserReports() {
  const container = document.getElementById("user-reports-container");
  if (!container) return;

  container.innerHTML = `<p>Loading your reports...</p>`;

  try {
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      container.innerHTML = `<p>Please log in to see your reports.</p>`;
      return;
    }

    const { data, error } = await supabase
      .from("reports")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) throw error;

    if (!data || data.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <span class="material-symbols-outlined">description</span>
          <p>No previous reports</p>
          <p class="empty-state-detail">Your outage reports will appear here</p>
        </div>`;
      return;
    }

    container.innerHTML = data
      .map(
        (report) => `
        <div class="report-card" data-id="${report.id}">
          <div class="report-header">
            <div class="feeder-info">${report.barangay || "N/A"}</div>
            <div class="status status-${report.status || "pending"}">${report.status || "Pending"}</div>
          </div>
          <div class="report-date">Reported: ${new Date(report.outage_time).toLocaleString()}</div>
          <div class="report-description">${report.description || ""}</div>
        </div>`
      )
      .join("");

    document.querySelectorAll(".report-card").forEach((card) => {
      card.addEventListener("click", () => showReportDetails(card.dataset.id));
    });
  } catch (err) {
    console.error("Error loading user reports:", err);
    container.innerHTML = `<p>Failed to load reports.</p>`;
  }
}

// ==============================
// Initialize Report Form
// ==============================
function initializeReportForm() {
  const causeButtons = document.querySelectorAll(".toggle-button");
  const selectedCauseInput = document.getElementById("selected-cause");

  causeButtons.forEach((button) => {
    button.addEventListener("click", function () {
      causeButtons.forEach((btn) => btn.classList.remove("active"));
      this.classList.add("active");
      selectedCauseInput.value = this.getAttribute("data-cause");
    });
  });

  const imageUpload = document.getElementById("image-upload");
  const imageInput = document.getElementById("image-input");
  if (imageUpload && imageInput) {
    imageUpload.addEventListener("click", () => imageInput.click());
    imageUpload.addEventListener("dragover", (e) => {
      e.preventDefault();
      imageUpload.classList.add("dragover");
    });
    imageUpload.addEventListener("dragleave", () => imageUpload.classList.remove("dragover"));
    imageUpload.addEventListener("drop", (e) => {
      e.preventDefault();
      imageUpload.classList.remove("dragover");
      handleImageUpload(e.dataTransfer.files[0]);
    });
    imageInput.addEventListener("change", (e) => handleImageUpload(e.target.files[0]));
  }

  const gpsToggle = document.getElementById("geolocation");
  if (gpsToggle) {
    gpsToggle.addEventListener("change", () => {
      if (gpsToggle.checked) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            document.getElementById("latitude").value = pos.coords.latitude;
            document.getElementById("longitude").value = pos.coords.longitude;
            console.log("📍 Location captured:", pos.coords);
          },
          (err) => {
            alert("Failed to get location. Please allow GPS access.");
            gpsToggle.checked = false;
          }
        );
      } else {
        document.getElementById("latitude").value = "";
        document.getElementById("longitude").value = "";
      }
    });
  }

  const submitButton = document.getElementById("submit-report");
  if (submitButton) submitButton.addEventListener("click", submitOutageReport);
}

// ==============================
// Handle Image Upload
// ==============================
let uploadedImageFile = null;

function handleImageUpload(file) {
  if (!file || !file.type.startsWith("image/")) {
    alert("Please select a valid image file");
    return;
  }
  uploadedImageFile = file;
  const reader = new FileReader();
  reader.onload = (e) => {
    const preview = document.getElementById("image-preview");
    preview.innerHTML = `<img src="${e.target.result}" alt="Preview" style="width:100px;height:100px;border-radius:8px;border:2px solid #f1c40f;">`;
  };
  reader.readAsDataURL(file);
}

// ==============================
// Reset Report Form
// ==============================
function resetReportForm() {
  document.querySelector("form")?.reset();
  uploadedImageFile = null;
  document.getElementById("image-preview").innerHTML = "";
  document.getElementById("selected-cause").value = "";
  document.querySelectorAll(".toggle-button").forEach((btn) => btn.classList.remove("active"));
  const imageInput = document.getElementById("image-input");
  if (imageInput) imageInput.value = "";
}

// ==============================
// Submit Report
// ==============================
async function submitOutageReport() {
  const barangay = document.getElementById("barangay-select").value;
  const outageTime = document.getElementById("outage-time").value;
  const cause = document.getElementById("selected-cause").value;
  const description = document.getElementById("outage-description").value;
  const latitude = document.getElementById("latitude")?.value || null;
  const longitude = document.getElementById("longitude")?.value || null;

  if (!barangay || !outageTime || !cause || !description) {
    alert("Please fill in all required fields");
    return;
  }

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    alert("Please log in to submit a report");
    return;
  }

  try {
    const { data: reportData, error: reportError } = await supabase
      .from("reports")
      .insert([{
        user_id: user.id,
        barangay,
        outage_time: outageTime,
        cause,
        description,
        latitude,
        longitude,
        status: "pending",
      }])
      .select()
      .single();

    if (reportError) throw reportError;

    if (uploadedImageFile) {
      const imagePath = `report_images/${user.id}/${reportData.id}/${uploadedImageFile.name}`;
      const { error: uploadError } = await supabase.storage.from("report_images").upload(imagePath, uploadedImageFile);
      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage.from("report_images").getPublicUrl(imagePath);

      await supabase.from("report_images").insert([{
        report_id: reportData.id,
        image_url: publicUrlData.publicUrl,
      }]);
    }

    showConfirmationPopup("✅ Outage report submitted successfully!");
    resetReportForm();
    loadUserReports();
    showPage("report");
  } catch (err) {
    console.error("❌ Error submitting report:", err);
    alert("Failed to submit report. Please try again.");
  }
}

// ==============================
// Confirmation Popup (Yellow Theme)
// ==============================
function showConfirmationPopup(message) {
  const popup = document.createElement("div");
  popup.classList.add("confirmation-popup");
  popup.innerHTML = `
    <div class="popup-box" style="border:2px solid #f1c40f;background:#fff;padding:20px;border-radius:12px;max-width:300px;text-align:center;position:relative;">
      <button class="popup-close" style="position:absolute;top:8px;right:8px;background:none;border:none;font-size:18px;cursor:pointer;">×</button>
      <p style="margin:20px 0;font-weight:bold;">${message}</p>
    </div>`;
  popup.style.cssText = `
    position:fixed;top:0;left:0;width:100%;height:100%;
    background:rgba(0,0,0,0.4);display:flex;justify-content:center;align-items:center;z-index:9999;
  `;
  document.body.appendChild(popup);

  popup.querySelector(".popup-close").addEventListener("click", () => popup.remove());
  setTimeout(() => popup.remove(), 2500);
}

// ==============================
// Report Details Modal
// ==============================
async function showReportDetails(reportId) {
  const { data: report, error } = await supabase.from("reports").select("*").eq("id", reportId).single();
  if (error) return alert("Failed to load report details");

  const { data: images } = await supabase.from("report_images").select("*").eq("report_id", reportId);

  const modal = document.createElement("div");
  modal.classList.add("report-modal");
  modal.style.cssText = `
    position:fixed;
    top:0;
    left:0;
    width:100%;
    height:100%;
    background:rgba(0,0,0,0.4);
    display:flex;
    justify-content:center;
    align-items:center;
    z-index:9999;
  `;

  modal.innerHTML = `
    <div class="modal-content" style="
      position:relative;
      background:#fff;
      border:2px solid #f1c40f;
      border-radius:14px;
      width:90%;
      max-width:400px;
      padding:12px;
      box-sizing:border-box;
    ">
      <button class="modal-close" style="
        position:absolute;
        top:12px;
        right:12px;
        width:36px;
        height:36px;
        font-size:24px;
        font-weight:bold;
        color:#fff;
        background:#f1c40f;
        border:none;
        border-radius:50%;
        cursor:pointer;
        box-shadow:0 2px 4px rgba(0,0,0,0.3);
      ">×</button>

      ${images && images.length
        ? `<div class="report-images-container" style="
            display:flex;
            overflow-x:auto;
            gap:6px;
            padding-bottom:10px;
            margin-top:12px;
          ">
            ${images.map(img => `<img src="${img.image_url}" style="flex:0 0 auto;width:100%;max-width:100%;border-radius:8px;border:2px solid #f1c40f;">`).join("")}
          </div>`
        : `<p style='margin-top:12px;color:#888;'>No images uploaded.</p>`
      }

      <div class="report-details" style="padding-top:12px;">
        <p><strong>Barangay:</strong> ${report.barangay}</p>
        <p><strong>Reported On:</strong> ${new Date(report.outage_time).toLocaleString()}</p>
        <p><strong>Cause:</strong> ${report.cause}</p>
        <p><strong>Description:</strong> ${report.description}</p>
        <p><strong>Status:</strong> <span class="status status-${report.status}">${report.status}</span></p>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // Close events
  modal.querySelector(".modal-close").addEventListener("click", () => modal.remove());
  modal.addEventListener("click", (e) => { if (e.target === modal) modal.remove(); });
}

// ==============================
// Initialize Report Form
// ==============================
function initializeReportForm() {
  const causeButtons = document.querySelectorAll(".toggle-button");
  const selectedCauseInput = document.getElementById("selected-cause");

  causeButtons.forEach((button) => {
    button.addEventListener("click", function () {
      causeButtons.forEach((btn) => btn.classList.remove("active"));
      this.classList.add("active");
      selectedCauseInput.value = this.getAttribute("data-cause");
    });
  });

  const imageUpload = document.getElementById("image-upload");
  const imageInput = document.getElementById("image-input");
  if (imageUpload && imageInput) {
    imageUpload.addEventListener("click", () => imageInput.click());
    imageUpload.addEventListener("dragover", (e) => {
      e.preventDefault();
      imageUpload.classList.add("dragover");
    });
    imageUpload.addEventListener("dragleave", () => imageUpload.classList.remove("dragover"));
    imageUpload.addEventListener("drop", (e) => {
      e.preventDefault();
      imageUpload.classList.remove("dragover");
      handleImageUpload(e.dataTransfer.files[0]);
    });
    imageInput.addEventListener("change", (e) => handleImageUpload(e.target.files[0]));
  }

  const gpsToggle = document.getElementById("geolocation");
  if (gpsToggle) {
    gpsToggle.addEventListener("change", () => {
      if (gpsToggle.checked) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            document.getElementById("latitude").value = pos.coords.latitude;
            document.getElementById("longitude").value = pos.coords.longitude;
          },
          () => {
            alert("Failed to get location. Please allow GPS access.");
            gpsToggle.checked = false;
          }
        );
      } else {
        document.getElementById("latitude").value = "";
        document.getElementById("longitude").value = "";
      }
    });
  }

  const submitButton = document.getElementById("submit-report");
  if (submitButton) submitButton.addEventListener("click", submitOutageReport);

  // Add Cancel button **below Submit**
  const existingCancel = document.getElementById("cancel-report");
  if (!existingCancel) {
    const cancelBtn = document.createElement("button");
    cancelBtn.id = "cancel-report";
    cancelBtn.textContent = "Cancel";
    cancelBtn.classList.add("cancel-button");
    cancelBtn.style.cssText = `
      margin-top:10px;
      width:100%;
      padding:10px;
      background:#eee;
      color:#333;
      border:none;
      border-radius:8px;
      font-weight:bold;
      cursor:pointer;
    `;
    submitButton.insertAdjacentElement("afterend", cancelBtn);

    cancelBtn.addEventListener("click", () => {
      resetReportForm();
      showPage("report");
    });
  }
}
// ==============================
// Report Details Modal (Simplified)
// ==============================
async function showReportDetails(reportId) {
  const { data: report, error } = await supabase.from("reports").select("*").eq("id", reportId).single();
  if (error) return alert("Failed to load report details");

  const { data: images } = await supabase.from("report_images").select("*").eq("report_id", reportId);

  const modal = document.createElement("div");
  modal.classList.add("report-modal");
  modal.style.cssText = `
    position:fixed;
    top:0;
    left:0;
    width:100%;
    height:100%;
    background:rgba(0,0,0,0.5);
    display:flex;
    justify-content:center;
    align-items:center;
    z-index:9999;
    overflow:auto;
    padding:20px;
    box-sizing:border-box;
  `;

  modal.innerHTML = `
    <div class="modal-content" style="
      position:relative;
      background:#fff;
      border:2px solid #f1c40f;
      border-radius:14px;
      width:100%;
      max-width:400px;
      padding:12px;
      box-sizing:border-box;
    ">
      <!-- X Button -->
      <button class="modal-close" style="
        position:absolute;
        top:8px;
        right:8px;
        width:28px;
        height:28px;
        font-size:18px;
        font-weight:bold;
        color:#fff;
        background:#f1c40f;
        border:none;
        border-radius:50%;
        cursor:pointer;
        box-shadow:0 2px 4px rgba(0,0,0,0.3);
        z-index:10;
      ">×</button>

      <!-- Images -->
      ${images && images.length
        ? `<div class="report-images-container" style="
            display:flex;
            flex-direction:column;
            gap:6px;
            margin-top:12px;
          ">
            ${images.map(img => `<img src="${img.image_url}" style="width:100%;border-radius:8px;border:2px solid #f1c40f;">`).join("")}
          </div>`
        : `<p style='margin-top:12px;color:#888;'>No images uploaded.</p>`
      }

      <!-- Details -->
      <div class="report-details" style="padding-top:12px;">
        <p><strong>Barangay:</strong> ${report.barangay}</p>
        <p><strong>Reported On:</strong> ${new Date(report.outage_time).toLocaleString()}</p>
        <p><strong>Cause:</strong> ${report.cause}</p>
        <p><strong>Description:</strong> ${report.description}</p>
        <p><strong>Status:</strong> <span class="status status-${report.status}">${report.status}</span></p>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // Close modal
  modal.querySelector(".modal-close").addEventListener("click", () => modal.remove());
  modal.addEventListener("click", (e) => { if (e.target === modal) modal.remove(); });
}


// ==============================
// Close Buttons Setup (Form, etc.)
// ==============================
function setupCloseButtons() {
  const closeFormBtn = document.getElementById("close-report-form");
  if (closeFormBtn) {
    closeFormBtn.addEventListener("click", () => showPage("report"));
  }
}

// ==============================
// Page Switcher Helper
// ==============================
function showPage(pageId) {
  document.querySelectorAll(".page").forEach((p) => p.classList.remove("active"));
  document.getElementById(pageId).classList.add("active");
  if (pageId === "report-form") initializeReportForm();
}
