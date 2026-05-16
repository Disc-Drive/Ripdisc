let activityVisible = true;

async function loadDestinations() {
  const cfg = await window.api.getConfig();
  const container = document.getElementById('destContainer');

  if (!container) return;

  if (cfg.nas && cfg.nas.enabled && cfg.nas.paths && cfg.nas.paths.length) {
    let options = "";

    cfg.nas.paths.forEach((p, i) => {
      options += `<option value="nas_${i}">${p.name}</option>`;
    });

    container.innerHTML = `<select id="destType">${options}</select>`;
  } else {
    container.innerHTML = `
      <input id="folderPath">
      <button onclick="browse()">Browse</button>
    `;
  }
}

async function loadDriveOptions() {
  const cfg = await window.api.getConfig();
  const drives = await window.api.detectDiscs();
  const select = document.getElementById('driveSelect');

  if (!select) return;

  const saved = cfg.driveLetter || "";

  select.innerHTML = "";

  if (!drives.length) {
    select.innerHTML = `<option value="">No Disc Detected</option>`;
    return;
  }

  drives.forEach(d => {
    const selected = d.letter === saved ? "selected" : "";
    select.innerHTML += `<option value="${d.letter}" ${selected}>${d.letter}: ${d.label}</option>`;
  });
}

async function loadDiscName() {
  const drives = await window.api.detectDiscs();
  const input = document.getElementById('discName');

  if (!drives.length || !input) return;

  input.value = drives[0].label;
}

async function browse() {
  const path = await window.api.selectFolder();
  if (!path) return;

  document.getElementById('folderPath').value = path;
}

async function start() {
  const cfg = await window.api.getConfig();

  let destinationType = "local";
  let localPath = "";
  let nasPath = "";

  const select = document.getElementById('destType');

  if (cfg.nas && cfg.nas.enabled && select) {
    const index = parseInt(select.value.split("_")[1]);
    destinationType = "nas";
    nasPath = cfg.nas.paths[index].path;
  } else {
    localPath = document.getElementById('folderPath')?.value || "";
  }

  const drive = document.getElementById('driveSelect').value;

  if (!drive) return;

  window.api.startRip({
    discName: document.getElementById('discName').value,
    driveLetter: drive,
    destinationType,
    localPath,
    nasPath
  });
}

window.api.onLog(d => {
  const log = document.getElementById('log');

  const stick =
    log.scrollTop + log.clientHeight >= log.scrollHeight - 5;

  log.textContent += d;

  if (activityVisible && stick) {
    log.scrollTop = log.scrollHeight;
  }
});

window.api.onActivityToggle(v => {
  activityVisible = v;
  document.getElementById('activityPanel').style.display = v ? "block" : "none";
});

window.api.onConfigUpdate(() => {
  loadDestinations();
  loadDriveOptions();
});

window.onload = () => {
  loadDestinations();
  loadDriveOptions();
  loadDiscName();
};

setInterval(loadDriveOptions, 2000);

let resizeTimer;

window.addEventListener('resize', () => {
  const layers = document.querySelectorAll('.bubbles');

  layers.forEach(el => el.classList.add('resizing'));

  clearTimeout(resizeTimer);

  resizeTimer = setTimeout(() => {
    layers.forEach(el => el.classList.remove('resizing'));
  }, 500);
});