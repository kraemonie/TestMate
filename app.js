import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getDatabase, ref, onValue, update, push, set, remove } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

const firebaseConfig = {
    apiKey: "AIzaSyCkxjYgv3J7D28auhqehs7dvcdat8rIbtI",
    authDomain: "trackmate-8fb8c.firebaseapp.com",
    databaseURL: "https://trackmate-8fb8c-default-rtdb.firebaseio.com/",
    projectId: "trackmate-8fb8c"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

let barChart, doughnutChart;
let globalBase64Image = "";
let requestsMap = {}; 

// --- AUTH ---
window.login = async () => {
    try { await signInWithEmailAndPassword(auth, document.getElementById('email').value, document.getElementById('password').value); } 
    catch(err) { document.getElementById('error-msg').innerText = err.message; }
};
window.logout = () => signOut(auth);

onAuthStateChanged(auth, u => {
    document.getElementById('login-container').style.display = u ? 'none' : 'flex';
    document.getElementById('dashboard-container').style.display = u ? 'flex' : 'none';
    if(u) initDashboard();
});

// --- DASHBOARD ---
function initDashboard() {
    // REQUESTS
    onValue(ref(db, 'Requests'), snap => {
        const data = snap.val();
        if(!data) { updateStats([]); return; }

        let all = [];
        requestsMap = {}; 

        if(data.AdmissionSlip) process(data.AdmissionSlip, "Admission Slip", all);
        if(data.GatePass) process(data.GatePass, "Gate Pass", all);
        if(data.ExitPass) process(data.ExitPass, "Exit Pass", all);

        all.sort((a,b) => new Date(b.date) - new Date(a.date));
        updateStats(all);
        renderCharts(all);
        renderTable(all);
    });

    // LOST & FOUND
    onValue(ref(db, 'LostAndFound'), snap => {
        const data = snap.val();
        const tbody = document.getElementById('lf-table-body');
        if(tbody) tbody.innerHTML = "";
        
        if(data) {
            Object.keys(data).forEach(key => {
                const item = data[key];
                const img = item.ImageUrl ? `<img src="${item.ImageUrl}" class="lf-thumb">` : `<div class="lf-thumb" style="background:#eee;display:flex;align-items:center;justify-content:center;">📷</div>`;
                
                tbody.innerHTML += `
                    <tr style="border-bottom:1px solid #eee;">
                        <td style="padding:10px;">${img}</td>
                        <td style="padding:10px;">
                            <div style="font-weight:bold; color:#004B8D;">${item.ItemName}</div>
                            <div style="font-size:11px; color:#888;">${item.LocationFound} • ${new Date(item.DateFound).toLocaleDateString()}</div>
                        </td>
                        <td style="text-align:right; padding-right:10px;">
                            <button class="btn-delete" onclick="deleteLostItem('${key}')">Delete</button>
                        </td>
                    </tr>
                `;
            });
        }
    });
}

function process(catData, type, arr) {
    Object.keys(catData).forEach(k => {
        const i = catData[k];
        const obj = { 
            id: k, type: type, rawType: type.replace(" ",""), 
            student: i.StudentEmail, date: i.RequestDate, status: i.Status, 
            details: i.Reason || i.ItemsToBring || i.ReasonCategory || i.Purpose,
            image: i.ParentLetterImage || null
        };
        arr.push(obj);
        requestsMap[k] = obj;
    });
}

function updateStats(data) {
    document.getElementById('total-count').innerText = data.length;
    document.getElementById('pending-count').innerText = data.filter(x => x.status === "Pending").length;
    document.getElementById('ready-count').innerText = data.filter(x => x.status === "Teacher Approved").length;
    document.getElementById('approved-count').innerText = data.filter(x => x.status === "DO Approved").length;
}

function renderCharts(data) {
    // BAR CHART
    const types = { "Admission": 0, "Gate Pass": 0, "Exit Pass": 0 };
    data.forEach(x => { if(x.type.includes("Admission")) types["Admission"]++; else if(x.type.includes("Gate")) types["Gate Pass"]++; else types["Exit Pass"]++; });
    
    const ctxBar = document.getElementById('barChart').getContext('2d');
    if (barChart) barChart.destroy();
    barChart = new Chart(ctxBar, { type: 'bar', data: { labels: Object.keys(types), datasets: [{ label: 'Requests', data: Object.values(types), backgroundColor: ['#004B8D', '#002F5D', '#FFD100'] }] }, options: { responsive: true, maintainAspectRatio: false } });

    // DOUGHNUT CHART
    const statuses = { "Pending": 0, "Ready DO": 0, "Done": 0, "Rejected": 0 };
    data.forEach(x => { if(x.status === "Pending") statuses["Pending"]++; else if(x.status === "Teacher Approved") statuses["Ready DO"]++; else if(x.status === "DO Approved") statuses["Done"]++; else statuses["Rejected"]++; });
    
    const ctxPie = document.getElementById('doughnutChart').getContext('2d');
    if (doughnutChart) doughnutChart.destroy();
    doughnutChart = new Chart(ctxPie, { type: 'doughnut', data: { labels: Object.keys(statuses), datasets: [{ data: Object.values(statuses), backgroundColor: ['#F57F17', '#004B8D', '#2E7D32', '#C62828'] }] }, options: { responsive: true, maintainAspectRatio: false, cutout: '70%' } });
}

function renderTable(data) {
    const tbody = document.getElementById('table-body');
    tbody.innerHTML = "";
    data.slice(0, 50).forEach(item => {
        let color = "#999";
        if(item.status === "Pending") color = "#F57F17";
        if(item.status === "Teacher Approved") color = "#004B8D";
        if(item.status === "DO Approved") color = "#2E7D32";
        if(item.status === "Rejected") color = "#C62828";

        const actionHtml = `<button onclick="viewDetails('${item.id}')" style="background:#EEE; color:#333; border:none; padding:5px 10px; border-radius:4px; cursor:pointer; font-weight:bold; font-size:12px;">View</button>`;

        tbody.innerHTML += `<tr><td>${new Date(item.date).toLocaleDateString()}</td><td><b>${item.type}</b></td><td>${item.student}</td><td><span style="color:${color}; font-weight:bold;">${item.status}</span></td><td>${actionHtml}</td></tr>`;
    });
}

// --- MODAL LOGIC ---
window.viewDetails = function(id) {
    const item = requestsMap[id];
    if(!item) return;
    document.getElementById('m-student').innerText = item.student;
    document.getElementById('m-date').innerText = new Date(item.date).toLocaleString();
    document.getElementById('m-details').innerText = item.details;
    document.getElementById('m-status-badge').innerText = item.status;

    const imgDiv = document.getElementById('m-image-container');
    const img = document.getElementById('m-image');
    if(item.image) { imgDiv.style.display = 'block'; img.src = item.image.startsWith('data:') ? item.image : `data:image/jpeg;base64,${item.image}`; } else { imgDiv.style.display = 'none'; }

    const actions = document.getElementById('m-actions');
    actions.innerHTML = "";
    if(item.status === "Teacher Approved") {
        actions.innerHTML = `<button onclick="setStatus('${item.rawType}','${item.id}','DO Approved'); closeModal()" class="btn-primary" style="background:#2E7D32; margin-right:10px;">Final Approve</button><button onclick="setStatus('${item.rawType}','${item.id}','Rejected'); closeModal()" class="btn-primary" style="background:#C62828;">Reject</button>`;
    } else {
        actions.innerHTML = `<span style="color:gray; font-size:12px;">No actions available.</span>`;
    }
    document.getElementById('request-modal').style.display = 'block';
}

// --- UTILS ---
window.setStatus = (type, id, status) => update(ref(db, `Requests/${type}/${id}`), { Status: status });
window.filterTable = () => {
    const filter = document.getElementById('searchInput').value.toUpperCase();
    const rows = document.getElementById("table-body").getElementsByTagName("tr");
    for (let row of rows) row.style.display = row.innerText.toUpperCase().includes(filter) ? "" : "none";
};
window.encodeImageFileAsURL = (el) => {
    const reader = new FileReader();
    reader.onloadend = () => globalBase64Image = reader.result;
    reader.readAsDataURL(el.files[0]);
};
window.postLostItem = () => {
    const n = document.getElementById('lf-name').value;
    const l = document.getElementById('lf-location').value;
    const d = document.getElementById('lf-desc').value;
    const date = document.getElementById('lf-date').value;
    if(!n) return alert("Name required");
    push(ref(db, 'LostAndFound'), { ItemName: n, LocationFound: l, Description: d, DateFound: date, ImageUrl: globalBase64Image })
        .then(() => { alert("Posted!"); globalBase64Image=""; });
};
window.deleteLostItem = (key) => { if(confirm("Delete item?")) remove(ref(db, `LostAndFound/${key}`)); };
