// frontend/script.js
const form = document.getElementById('healthForm');
const submitBtn = document.getElementById('submitBtn');
const demoBtn = document.getElementById('demoBtn');
const statusMeta = document.getElementById('statusMeta');
const errorMsg = document.getElementById('errorMsg');
const resultCard = document.getElementById('resultCard');
const comparisonTableBody = document.querySelector('#comparisonTable tbody');
const summaryMeta = document.getElementById('summaryMeta');
const urgencyEl = document.getElementById('urgency');
const recommendationsEl = document.getElementById('recommendations');
let chart;

// loader display
function setLoading(isLoading){
  if(isLoading){
    submitBtn.disabled = true;
    submitBtn.innerHTML = 'Analyzing...';
  } else {
    submitBtn.disabled = false;
    submitBtn.innerHTML = 'Submit';
  }
}

function showError(msg){
  errorMsg.style.display = 'block';
  errorMsg.textContent = msg;
}
function clearError(){
  errorMsg.style.display = 'none';
  errorMsg.textContent = '';
}

function renderResults(data){
  resultCard.style.display = 'block';
  comparisonTableBody.innerHTML = '';
  urgencyEl.textContent = data.urgency || '';
  summaryMeta.textContent = `Based on ${data.source || 'local records'}.`;
  const costs = [];
  const durations = [];

  data.treatments.forEach(t => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${t.type}</td>
                    <td>₹ ${t.cost == null ? 'N/A' : t.cost.toLocaleString()}</td>
                    <td>${t.duration || 'N/A'}</td>
                    <td>${t.sideEffects || 'None reported'}</td>`;
    comparisonTableBody.appendChild(tr);
    costs.push(t.cost || 0);
    durations.push(t.durationValue || 0);
  });

  recommendationsEl.innerHTML = '';
  (data.recommendations || []).forEach(r => {
    const li = document.createElement('li');
    li.textContent = r;
    recommendationsEl.appendChild(li);
  });

  // chart
  const ctx = document.getElementById('barChart').getContext('2d');
  if(chart) chart.destroy();
  chart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: data.treatments.map(t => t.type),
      datasets: [
        { label: 'Cost (₹)', data: costs },
        { label: 'Duration (days)', data: durations }
      ]
    },
    options: {
      responsive: true,
      interaction: { mode:'index', intersect:false },
      scales: { y: { beginAtZero:true } }
    }
  });
}

async function analyze(requestData){
  clearError();
  setLoading(true);
  statusMeta.textContent = 'Contacting backend...';
  try {
    const resp = await fetch('http://localhost:8080/analyze-health', {
      method:'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify(requestData)
    });
    if(!resp.ok) throw new Error('Server returned ' + resp.status);
    const data = await resp.json();
    setLoading(false);
    statusMeta.textContent = '';
    // renderResults(data);
    // Save data for new page
    localStorage.setItem("curevia_result", JSON.stringify(data));

    // Redirect to results page
    window.location.href = "result.html";

  } catch (err) {
    setLoading(false);
    statusMeta.textContent = 'Backend unreachable — showing demo results.';
    console.warn(err);
    showError('Backend not reachable. You can run demo or start the backend.');
    renderResults(demoResponse(requestData));
  }
}

function demoResponse(req){
  const base = 10000 + ((req.age || 30) * 50);
  return {
    source: `Demo aggregated records for ${req.city || 'Demo City'}`,
    urgency: (req.symptoms && req.symptoms.toLowerCase().includes('chest')) ? 'High: Seek urgent care' : 'Normal',
    treatments: [
      { type: 'Allopathic', cost: Math.round(base * 1.3), duration: '30-90 days', durationValue: 60, sideEffects: 'Possible medication side effects (nausea, drowsiness)' },
      { type: 'Ayurvedic', cost: Math.round(base * 0.8), duration: '60-180 days', durationValue: 120, sideEffects: 'Milder; requires lifestyle changes' },
      { type: 'Homeopathic', cost: Math.round(base * 0.5), duration: '30-120 days', durationValue: 75, sideEffects: 'Minimal side effects reported' },
    ],
    recommendations: [
      'Consult a registered practitioner before starting treatment.',
      'For severe symptoms, visit nearest hospital.',
      'Verify local clinic pricing and availability.'
    ]
  };
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  clearError();

  const diseaseName = document.getElementById('diseaseName').value.trim();
  const affectedOrgan = document.getElementById('affectedOrgan').value.trim();
  const city = document.getElementById('city').value.trim();
  const age = Number(document.getElementById('age').value);
  const gender = document.querySelector('input[name="gender"]:checked')?.value;
  const symptoms = document.getElementById('symptoms').value.trim();

  if(!city || !age || !gender || !symptoms){
    showError('Please fill required fields: city, age, gender and symptoms.');
    return;
  }

  const requestData = { diseaseName, affectedOrgan, city, age, gender, symptoms };
  analyze(requestData);
});

demoBtn.addEventListener('click', () => {
  const req = {
    diseaseName: document.getElementById('diseaseName').value.trim(),
    affectedOrgan: document.getElementById('affectedOrgan').value.trim(),
    city: document.getElementById('city').value.trim() || 'Demo City',
    age: Number(document.getElementById('age').value) || 35,
    gender: document.querySelector('input[name="gender"]:checked')?.value || 'male',
    symptoms: document.getElementById('symptoms').value.trim() || 'fatigue'
  };
  renderResults(demoResponse(req));
  statusMeta.textContent = 'Demo results displayed';
});
