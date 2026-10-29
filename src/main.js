import JSZip from 'jszip';
import './style.css';

const $ = (selector) => document.querySelector(selector);
const form = $('#analysis-form');
const fileInput = $('#data-file');
const dropZone = $('#drop-zone');
const dropTitle = $('#drop-title');
const dropDescription = $('#drop-description');
const selectedFilesEl = $('#selected-files');
const errorEl = $('#form-error');
const analyzeButton = $('#analyze-button');
const resultsSection = $('#results');
const resultSearch = $('#result-search');
const userList = $('#user-list');
const emptyState = $('#empty-state');
const toast = $('#toast');
const loadMoreButton = $('#load-more-button');
let selectedFiles = [];
let sets = { followers: [], following: [], notFollowing: [], fans: [], mutual: [] };
let activeTab = 'not-following';
let visibleRows = 50;
let toastTimer;
$('#current-year').textContent = String(new Date().getFullYear());

function normalizeHandle(raw) {
  if (typeof raw !== 'string') return '';
  let value = raw.trim();
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) {
    try {
      const url = new URL(value);
      if (!/(^|\.)instagram\.com$/i.test(url.hostname)) return '';
      const parts = url.pathname.split('/').filter(Boolean);
      value = parts[parts[0] === '_u' ? 1 : 0] || '';
    } catch { return ''; }
  }
  value = value.replace(/^@+/, '').split(/[/?#]/)[0].trim();
  return /^[a-zA-Z0-9._]{1,30}$/.test(value) ? value : '';
}

function getRole(fileName) {
  const name = fileName.split('/').pop().toLowerCase();
  if (/^followers?(?:_\d+)?\.json$/.test(name)) return 'followers';
  if (/^following(?:_\d+)?\.json$/.test(name)) return 'following';
  return null;
}

function findList(data, role) {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== 'object') return null;
  const keys = role === 'followers'
    ? ['relationships_followers', 'followers', 'data']
    : ['relationships_following', 'following', 'data'];
  for (const key of keys) if (Array.isArray(data[key])) return data[key];
  for (const value of Object.values(data)) {
    if (Array.isArray(value) && value.some((item) => item && typeof item === 'object' && ('string_list_data' in item || 'title' in item))) return value;
  }
  return null;
}

function extractHandles(parsed, role, fileName) {
  const list = findList(parsed, role);
  if (!list) throw new Error('Format ' + fileName + ' belum dikenali. Pilih JSON ekspor Instagram yang valid.');
  const handles = [];
  for (const item of list) {
    const candidates = [];
    if (typeof item === 'string') candidates.push(item);
    else if (item && typeof item === 'object') {
      if (Array.isArray(item.string_list_data)) {
        for (const entry of item.string_list_data) candidates.push(entry?.value || entry?.href || '');
      }
      candidates.push(item.username || '', item.title || '', item.href || '');
    }
    for (const candidate of candidates) {
      const handle = normalizeHandle(candidate);
      if (handle) { handles.push(handle); break; }
    }
  }
  return handles;
}

async function readJsonFile(fileName, readContent) {
  const role = getRole(fileName);
  if (!role) return null;
  let parsed;
  try { parsed = JSON.parse(await readContent()); }
  catch { throw new Error('Tidak bisa membaca ' + fileName + '. Pastikan file JSON valid.'); }
  return { role, handles: extractHandles(parsed, role, fileName) };
}

async function getRecords(files) {
  const records = [];
  for (const file of files) {
    if (file.name.toLowerCase().endsWith('.zip')) {
      let zip;
      try { zip = await JSZip.loadAsync(file); }
      catch { throw new Error(file.name + ' tidak bisa dibuka. Pastikan ZIP tidak rusak.'); }
      const entries = Object.values(zip.files).filter((entry) => !entry.dir && getRole(entry.name));
      if (!entries.length) throw new Error('Tidak ditemukan followers_1.json atau following.json di dalam ZIP ini.');
      for (const entry of entries) {
        const record = await readJsonFile(entry.name, () => entry.async('string'));
        if (record) records.push(record);
      }
    } else if (file.name.toLowerCase().endsWith('.json')) {
      const record = await readJsonFile(file.name, () => file.text());
      if (record) records.push(record);
    } else throw new Error('Format ' + file.name + ' belum didukung. Pilih ZIP atau JSON.');
  }
  return records;
}

function uniqueHandles(values) {
  const unique = new Map();
  for (const raw of values) {
    const name = normalizeHandle(raw);
    if (name && !unique.has(name.toLowerCase())) unique.set(name.toLowerCase(), name);
  }
  return [...unique.values()].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }));
}

function compareRecords(records) {
  const followerRecords = records.filter((record) => record.role === 'followers');
  const followingRecords = records.filter((record) => record.role === 'following');
  if (!followerRecords.length || !followingRecords.length) throw new Error('Data belum lengkap. Unggah ZIP ekspor lengkap, atau pilih followers_1.json dan following.json sekaligus.');
  const followers = uniqueHandles(followerRecords.flatMap((record) => record.handles));
  const following = uniqueHandles(followingRecords.flatMap((record) => record.handles));
  if (!followers.length && !following.length) throw new Error('Data followers dan following kosong atau tidak dikenali. Coba ekspor ulang dalam format JSON.');
  const followerKeys = new Set(followers.map((name) => name.toLowerCase()));
  const followingKeys = new Set(following.map((name) => name.toLowerCase()));
  return {
    followers, following,
    notFollowing: following.filter((name) => !followerKeys.has(name.toLowerCase())),
    fans: followers.filter((name) => !followingKeys.has(name.toLowerCase())),
    mutual: following.filter((name) => followerKeys.has(name.toLowerCase()))
  };
}

function showError(message) { errorEl.textContent = message; errorEl.hidden = false; }
function clearError() { errorEl.textContent = ''; errorEl.hidden = true; }
function pluralize(count) { return new Intl.NumberFormat('id-ID').format(count) + ' akun'; }

function updateFilesUI() {
  selectedFilesEl.replaceChildren();
  if (!selectedFiles.length) {
    dropTitle.textContent = 'Pilih file atau tarik ke sini';
    dropDescription.textContent = 'ZIP Instagram paling mudah. Kamu juga bisa memilih followers_1.json dan following.json.';
    selectedFilesEl.hidden = true;
    return;
  }
  const jsonCount = selectedFiles.filter((file) => file.name.toLowerCase().endsWith('.json')).length;
  const zipCount = selectedFiles.filter((file) => file.name.toLowerCase().endsWith('.zip')).length;
  const bytes = selectedFiles.reduce((sum, file) => sum + file.size, 0);
  const size = bytes < 1048576 ? Math.max(1, Math.round(bytes / 1024)) + ' KB' : (bytes / 1048576).toFixed(1) + ' MB';
  dropTitle.textContent = selectedFiles.length + ' file dipilih';
  dropDescription.textContent = zipCount + ' ZIP · ' + jsonCount + ' JSON · ' + size;
  selectedFilesEl.hidden = false;
  for (const file of selectedFiles) {
    const chip = document.createElement('div');
    chip.className = 'file-chip';
    const name = document.createElement('span');
    name.textContent = file.name;
    const sizeLabel = document.createElement('small');
    sizeLabel.textContent = file.size < 1048576 ? Math.max(1, Math.round(file.size / 1024)) + ' KB' : (file.size / 1048576).toFixed(1) + ' MB';
    chip.append(name, sizeLabel);
    selectedFilesEl.append(chip);
  }
}

function listForActiveTab() {
  if (activeTab === 'fans') return sets.fans;
  if (activeTab === 'mutual') return sets.mutual;
  return sets.notFollowing;
}

function makeUserRow(username, index, category) {
  const row = document.createElement('article');
  row.className = 'user-row';
  const avatar = document.createElement('div');
  avatar.className = 'avatar color-' + (index % 5);
  avatar.textContent = username.replace(/[^a-zA-Z0-9]/g, '').slice(0, 1).toUpperCase() || '?';
  const info = document.createElement('div');
  info.className = 'user-info';
  const handle = document.createElement('strong');
  handle.textContent = '@' + username;
  const detail = document.createElement('small');
  detail.textContent = category === 'fans' ? 'Mengikuti kamu' : category === 'mutual' ? 'Saling mengikuti' : 'Belum mengikuti kamu kembali';
  info.append(handle, detail);
  const link = document.createElement('a');
  link.className = 'profile-link';
  link.href = 'https://www.instagram.com/' + encodeURIComponent(username) + '/';
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.setAttribute('aria-label', 'Buka profil Instagram @' + username + ' di tab baru');
  link.innerHTML = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M7 4h9v9m0-9L7 13M15 12v4H4V5h4"/></svg>';
  row.append(avatar, info, link);
  return row;
}

function renderList() {
  const all = listForActiveTab();
  const query = resultSearch.value.trim().replace(/^@/, '').toLowerCase();
  const filtered = all.filter((name) => name.toLowerCase().includes(query));
  const shown = filtered.slice(0, visibleRows);
  userList.replaceChildren();
  const fragment = document.createDocumentFragment();
  shown.forEach((name, index) => fragment.append(makeUserRow(name, index, activeTab)));
  userList.append(fragment);
  $('#list-count').textContent = pluralize(filtered.length);
  $('#list-page-label').textContent = filtered.length ? 'Menampilkan ' + Math.min(visibleRows, filtered.length) + ' dari ' + filtered.length : 'Tidak ada hasil';
  loadMoreButton.hidden = filtered.length <= visibleRows;
  emptyState.hidden = filtered.length > 0;
  userList.hidden = filtered.length === 0;
  if (!filtered.length) {
    $('#empty-title').textContent = query ? 'Username tidak ditemukan' : 'Tidak ada akun di kategori ini';
    $('#empty-description').textContent = query ? 'Coba kata pencarian lain.' : 'Kategori ini kosong di data ekspor kamu.';
  }
}

function renderResults() {
  $('#followers-count').textContent = new Intl.NumberFormat('id-ID').format(sets.followers.length);
  $('#following-count').textContent = new Intl.NumberFormat('id-ID').format(sets.following.length);
  $('#not-following-count').textContent = new Intl.NumberFormat('id-ID').format(sets.notFollowing.length);
  $('#mutual-count').textContent = new Intl.NumberFormat('id-ID').format(sets.mutual.length);
  $('#tab-not-following').textContent = sets.notFollowing.length;
  $('#tab-fans').textContent = sets.fans.length;
  $('#tab-mutual').textContent = sets.mutual.length;
  const username = $('#username').value.trim().replace(/^@/, '');
  $('#results-subtitle').textContent = username ? 'Hasil perbandingan untuk @' + username + '.' : 'Berikut hasil perbandingan followers dan following kamu.';
  activeTab = 'not-following';
  visibleRows = 50;
  resultSearch.value = '';
  document.querySelectorAll('.result-tab').forEach((button) => {
    const active = button.dataset.tab === activeTab;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
  });
  renderList();
  resultsSection.hidden = false;
  resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2500);
}

function exportCsv() {
  const labels = { 'not-following': 'Tidak follow balik', fans: 'Fans', mutual: 'Mutual' };
  const rows = listForActiveTab();
  const quote = (value) => '"' + String(value).replaceAll('"', '""') + '"';
  const csv = [['Kategori', 'Username'], ...rows.map((name) => [labels[activeTab], '@' + name])]
    .map((row) => row.map(quote).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8;' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'social-viewer-' + activeTab + '.csv';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  showToast('CSV ' + labels[activeTab].toLowerCase() + ' berhasil diekspor.');
}

async function copyUsernames() {
  const rows = listForActiveTab();
  if (!rows.length) { showToast('Tidak ada username untuk disalin.'); return; }
  const value = rows.map((name) => '@' + name).join('\n');
  try { await navigator.clipboard.writeText(value); }
  catch {
    const area = document.createElement('textarea');
    area.value = value;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.append(area);
    area.select();
    const copied = document.execCommand('copy');
    area.remove();
    if (!copied) { showToast('Salin otomatis tidak tersedia. Gunakan ekspor CSV.'); return; }
  }
  showToast(rows.length + ' username disalin.');
}

fileInput.addEventListener('change', () => {
  selectedFiles = [...fileInput.files];
  clearError();
  updateFilesUI();
});
for (const type of ['dragenter', 'dragover']) dropZone.addEventListener(type, (event) => {
  event.preventDefault();
  dropZone.classList.add('dragover');
});
for (const type of ['dragleave', 'drop']) dropZone.addEventListener(type, (event) => {
  event.preventDefault();
  dropZone.classList.remove('dragover');
});
dropZone.addEventListener('drop', (event) => {
  const files = [...(event.dataTransfer?.files || [])].filter((file) => /\.(zip|json)$/i.test(file.name));
  if (!files.length) { showError('Pilih arsip ZIP atau file JSON.'); return; }
  selectedFiles = files;
  try {
    const transfer = new DataTransfer();
    files.forEach((file) => transfer.items.add(file));
    fileInput.files = transfer.files;
  } catch { /* selectedFiles remains available if DataTransfer is restricted. */ }
  clearError();
  updateFilesUI();
});
dropZone.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); fileInput.click(); }
});
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  clearError();
  if (!selectedFiles.length) { showError('Pilih file ZIP atau JSON ekspor Instagram dulu.'); return; }
  const label = analyzeButton.querySelector('span').textContent;
  analyzeButton.disabled = true;
  analyzeButton.querySelector('span').textContent = 'Memproses data…';
  try {
    sets = compareRecords(await getRecords(selectedFiles));
    renderResults();
    showToast('Selesai. ' + pluralize(sets.notFollowing.length) + ' tidak follow balik.');
  } catch (error) { showError(error instanceof Error ? error.message : 'Ada kendala saat membaca file.'); }
  finally { analyzeButton.disabled = false; analyzeButton.querySelector('span').textContent = label; }
});
document.querySelectorAll('.result-tab').forEach((button) => button.addEventListener('click', () => {
  activeTab = button.dataset.tab;
  visibleRows = 50;
  document.querySelectorAll('.result-tab').forEach((tab) => {
    const active = tab === button;
    tab.classList.toggle('active', active);
    tab.setAttribute('aria-selected', String(active));
  });
  renderList();
}));
resultSearch.addEventListener('input', () => { visibleRows = 50; renderList(); });
loadMoreButton.addEventListener('click', () => { visibleRows += 50; renderList(); });
$('#export-button').addEventListener('click', exportCsv);
$('#copy-button').addEventListener('click', copyUsernames);
$('#reset-button').addEventListener('click', () => {
  sets = { followers: [], following: [], notFollowing: [], fans: [], mutual: [] };
  selectedFiles = [];
  fileInput.value = '';
  $('#username').value = '';
  resultsSection.hidden = true;
  clearError();
  updateFilesUI();
  $('#tracker').scrollIntoView({ behavior: 'smooth', block: 'start' });
});