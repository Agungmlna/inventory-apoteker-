(() => {
  'use strict';

  const STORAGE_KEY = 'medistock-data-v1';
  const $ = (id) => document.getElementById(id);
  const todayISO = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  };
  const makeId = () => (window.crypto && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const formatMoney = (value) => `Rp${Number(value || 0).toLocaleString('id-ID')}`;
  const expiryOrder = (a, b) => (a.expiry || '9999-12-31').localeCompare(b.expiry || '9999-12-31') || String(a.name || '').localeCompare(String(b.name || ''), 'id');

  let state = loadState();
  let toastTimer;
  let reportRange = { from: '', to: '' };
  let cart = [];

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (saved && Array.isArray(saved.items) && Array.isArray(saved.movements)) {
        saved.sales = Array.isArray(saved.sales) ? saved.sales : [];
        saved.items.forEach((item) => {
          item.stock = Number(item.stock || 0);
          item.price = Number(item.price || 0);
        });
        return saved;
      }
    } catch (error) {
      console.warn('Data Medistock tidak dapat dibaca:', error);
    }
    return { items: [], movements: [], sales: [] };
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      console.error('Data Medistock tidak dapat disimpan:', error);
      showToast('Data gagal disimpan. Periksa ruang penyimpanan browser.');
    }
  }

  function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  }

  function formatDate(value) {
    if (!value) return '—';
    const parts = String(value).split('-').map(Number);
    if (parts.length !== 3 || !parts[0]) return '—';
    return new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(parts[0], parts[1] - 1, parts[2]));
  }

  function expiryStatus(item) {
    if (!item.expiry) return 'safe';
    const today = new Date(`${todayISO()}T00:00:00`);
    const expiry = new Date(`${item.expiry}T00:00:00`);
    const days = Math.floor((expiry - today) / 86400000);
    if (days < 0) return 'expired';
    if (days <= 30) return 'soon';
    return 'safe';
  }

  function statusBadge(item) {
    const status = expiryStatus(item);
    const labels = { safe: 'Masih aman', soon: 'Segera kedaluwarsa', expired: 'Kedaluwarsa' };
    let html = `<span class="badge ${status}">${labels[status]}</span>`;
    if (Number(item.stock) <= 5) html += ' <span class="badge low">Stok menipis</span>';
    return html;
  }

  function showToast(message) {
    const toast = $('toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2800);
  }

  function openModal(id) {
    const modal = $(id);
    if (!modal) return;
    modal.classList.remove('hidden');
    const firstInput = modal.querySelector('input:not([type="hidden"]), select');
    if (firstInput) setTimeout(() => firstInput.focus(), 0);
  }

  function closeModal(id) {
    if ($(id)) $(id).classList.add('hidden');
  }

  function navigate(page) {
    if (!$(`page-${page}`)) return;
    document.querySelectorAll('.page').forEach((section) => section.classList.toggle('active', section.id === `page-${page}`));
    document.querySelectorAll('.nav-link').forEach((button) => button.classList.toggle('active', button.dataset.page === page));
    const titles = { dashboard: 'Dashboard', inventory: 'Data Barang', movements: 'Barang Masuk / Keluar', reports: 'Laporan' };
    $('pageTitle').textContent = titles[page] || page;
    $('sidebar').classList.remove('open');
    if (page === 'reports') renderReports();
  }

  function renderDashboard() {
    $('statItems').textContent = state.items.length.toLocaleString('id-ID');
    $('statStock').textContent = state.items.reduce((sum, item) => sum + Number(item.stock || 0), 0).toLocaleString('id-ID');
    $('statExpiring').textContent = state.items.filter((item) => expiryStatus(item) === 'soon').length.toLocaleString('id-ID');
    $('statExpired').textContent = state.items.filter((item) => expiryStatus(item) === 'expired').length.toLocaleString('id-ID');

    const attention = state.items.filter((item) => ['soon', 'expired'].includes(expiryStatus(item))).sort(expiryOrder);
    $('attentionTable').innerHTML = attention.map((item) => `<tr>
      <td><span class="item-name">${escapeHTML(item.name)}</span><span class="table-sub">${escapeHTML(item.batch || 'Tanpa batch')}</span></td>
      <td>${escapeHTML(item.category)}</td><td class="stock-cell">${Number(item.stock).toLocaleString('id-ID')} ${escapeHTML(item.unit)}</td>
      <td>${formatDate(item.expiry)}</td><td>${statusBadge(item)}</td>
    </tr>`).join('');
    $('attentionEmpty').classList.toggle('hidden', attention.length > 0);

    const recent = [...state.movements].sort((a, b) => `${b.date || ''}${b.createdAt || ''}`.localeCompare(`${a.date || ''}${a.createdAt || ''}`)).slice(0, 5);
    $('recentActivity').innerHTML = recent.map((movement) => {
      const item = state.items.find((entry) => entry.id === movement.itemId);
      const name = movement.itemName || (item && item.name) || 'Barang dihapus';
      const isIn = movement.type === 'in';
      return `<div class="activity-row"><span class="activity-symbol ${isIn ? 'in' : 'out'}">${isIn ? '↓' : '↑'}</span>
        <div class="activity-body"><div class="activity-title">${isIn ? 'Barang masuk' : 'Barang keluar'} · ${escapeHTML(name)}</div>
        <div class="activity-desc">${Number(movement.qty).toLocaleString('id-ID')} ${escapeHTML(movement.unit || (item && item.unit) || 'unit')}${movement.note ? ` · ${escapeHTML(movement.note)}` : ''}</div></div>
        <span class="activity-time">${formatDate(movement.date)}</span></div>`;
    }).join('');
    $('activityEmpty').classList.toggle('hidden', recent.length > 0);
  }

  function renderInventory() {
    const query = $('inventorySearch').value.trim().toLocaleLowerCase('id');
    const filter = $('statusFilter').value;
    const filtered = state.items.filter((item) => {
      const searchable = `${item.name} ${item.category} ${item.batch || ''}`.toLocaleLowerCase('id');
      if (query && !searchable.includes(query)) return false;
      const status = expiryStatus(item);
      if (['safe', 'soon', 'expired'].includes(filter)) return status === filter;
      if (filter === 'low') return Number(item.stock) <= 5;
      return true;
    }).sort(expiryOrder);

    $('inventoryTable').innerHTML = filtered.map((item) => `<tr>
      <td><span class="item-name">${escapeHTML(item.name)}</span></td><td>${escapeHTML(item.category)}</td>
      <td>${escapeHTML(item.batch || '—')}</td><td class="stock-cell">${Number(item.stock).toLocaleString('id-ID')} ${escapeHTML(item.unit)}</td>
      <td>${formatDate(item.expiry)}</td><td>${statusBadge(item)}</td>
      <td><div class="row-actions"><button class="small-action" data-edit-item="${escapeHTML(item.id)}" title="Edit barang" aria-label="Edit ${escapeHTML(item.name)}">✎</button><button class="small-action" data-delete-item="${escapeHTML(item.id)}" title="Hapus barang" aria-label="Hapus ${escapeHTML(item.name)}">×</button></div></td>
    </tr>`).join('');
    $('inventoryEmpty').classList.toggle('hidden', filtered.length > 0);
    $('inventoryCount').textContent = `Menampilkan ${filtered.length} dari ${state.items.length} barang`;
  }

  function renderMovementProductOptions(selectedId = '') {
    const select = $('movementProduct');
    select.innerHTML = '<option value="">Pilih barang</option>' + [...state.items].sort(expiryOrder).map((item) =>
      `<option value="${escapeHTML(item.id)}" ${item.id === selectedId ? 'selected' : ''}>${escapeHTML(item.name)} — stok ${Number(item.stock).toLocaleString('id-ID')} ${escapeHTML(item.unit)}</option>`).join('');
  }

  function movementRows(list) {
    return list.map((movement) => {
      const item = state.items.find((entry) => entry.id === movement.itemId);
      const name = movement.itemName || (item && item.name) || 'Barang dihapus';
      const unit = movement.unit || (item && item.unit) || 'unit';
      return `<tr><td>${formatDate(movement.date)}</td><td><span class="item-name">${escapeHTML(name)}</span></td>
        <td><span class="badge ${movement.type === 'in' ? 'in' : 'out'}">${movement.type === 'in' ? 'Masuk' : 'Keluar'}</span></td>
        <td class="stock-cell">${Number(movement.qty).toLocaleString('id-ID')} ${escapeHTML(unit)}</td>
        <td>${movement.unitPrice ? formatMoney(movement.unitPrice) : '—'}</td><td>${movement.total ? formatMoney(movement.total) : '—'}</td>
        <td>${escapeHTML(movement.batch || (item && item.batch) || '—')}</td><td>${escapeHTML(movement.note || '—')}</td></tr>`;
    }).join('');
  }

  function getFilteredMovements() {
    const query = $('movementSearch').value.trim().toLocaleLowerCase('id');
    const type = $('movementTypeFilter').value;
    const date = $('movementDateFilter').value;
    return [...state.movements].filter((movement) => {
      const item = state.items.find((entry) => entry.id === movement.itemId);
      const searchable = `${movement.itemName || (item && item.name) || ''} ${movement.note || ''} ${movement.batch || ''}`.toLocaleLowerCase('id');
      return (!query || searchable.includes(query)) && (type === 'all' || movement.type === type) && (!date || movement.date === date);
    }).sort((a, b) => `${b.date || ''}${b.createdAt || ''}`.localeCompare(`${a.date || ''}${a.createdAt || ''}`));
  }

  function renderMovements() {
    const movements = getFilteredMovements();
    $('movementTable').innerHTML = movementRows(movements);
    $('movementEmpty').classList.toggle('hidden', movements.length > 0);
    $('movementCount').textContent = `Menampilkan ${movements.length} transaksi`;
  }

  function getReportMovements() {
    return [...state.movements]
      .filter((movement) => (!reportRange.from || movement.date >= reportRange.from) && (!reportRange.to || movement.date <= reportRange.to))
      .sort((a, b) => {
        // Barang masuk diurutkan dari yang paling dekat kedaluwarsa.
        if (a.type === 'in' && b.type === 'in') {
          const itemA = state.items.find((item) => item.id === a.itemId);
          const itemB = state.items.find((item) => item.id === b.itemId);
          return ((a.expiry || (itemA && itemA.expiry) || '9999-12-31').localeCompare(b.expiry || (itemB && itemB.expiry) || '9999-12-31'));
        }
        return `${b.date || ''}${b.createdAt || ''}`.localeCompare(`${a.date || ''}${a.createdAt || ''}`);
      });
  }

  function renderReports() {
    const movements = getReportMovements();
    const incoming = movements.filter((movement) => movement.type === 'in').reduce((sum, movement) => sum + Number(movement.qty || 0), 0);
    const outgoing = movements.filter((movement) => movement.type === 'out').reduce((sum, movement) => sum + Number(movement.qty || 0), 0);
    const revenue = movements.filter((movement) => movement.saleId).reduce((sum, movement) => sum + Number(movement.total || 0), 0);
    $('reportIn').textContent = incoming.toLocaleString('id-ID');
    $('reportOut').textContent = outgoing.toLocaleString('id-ID');
    $('reportTransactions').textContent = movements.length.toLocaleString('id-ID');
    $('reportProducts').textContent = state.items.length.toLocaleString('id-ID');
    $('reportRevenue').textContent = formatMoney(revenue);
    $('reportTable').innerHTML = movementRows(movements);
    $('reportEmpty').classList.toggle('hidden', movements.length > 0);
    $('reportPeriodLabel').textContent = reportRange.from || reportRange.to
      ? `${reportRange.from ? formatDate(reportRange.from) : 'Awal'} — ${reportRange.to ? formatDate(reportRange.to) : 'Sekarang'}`
      : 'Semua riwayat transaksi';
    renderSales();
  }

  function renderAll() {
    renderDashboard();
    renderInventory();
    renderMovements();
    renderReports();
  }

  function openItemForm(item = null) {
    $('itemForm').reset();
    $('itemId').value = item ? item.id : '';
    $('itemModalTitle').textContent = item ? 'Edit Barang' : 'Tambah Barang';
    $('itemName').value = item ? item.name : '';
    $('itemCategory').value = item ? item.category : '';
    $('itemBatch').value = item ? item.batch || '' : '';
    $('itemStock').value = item ? item.stock : '';
    $('itemUnit').value = item ? item.unit || 'strip' : 'strip';
    $('itemPrice').value = item ? Number(item.price || 0) : '';
    $('itemExpiry').value = item ? item.expiry || '' : '';
    openModal('itemModal');
  }

  function openMovementForm(type) {
    if (!state.items.length) {
      showToast('Tambahkan barang terlebih dahulu.');
      navigate('inventory');
      return;
    }
    $('movementForm').reset();
    $('movementType').value = type;
    const isIn = type === 'in';
    $('movementModalTitle').textContent = isIn ? 'Barang Masuk' : 'Barang Keluar';
    $('movementEyebrow').textContent = isIn ? 'CATAT BARANG MASUK' : 'CATAT BARANG KELUAR';
    $('saveMovementBtn').textContent = isIn ? 'Simpan Barang Masuk' : 'Simpan Barang Keluar';
    $('movementBatchWrap').classList.toggle('hidden', !isIn);
    $('movementExpiryWrap').classList.toggle('hidden', !isIn);
    $('movementDate').value = todayISO();
    $('movementBatch').value = '';
    $('movementExpiry').value = '';
    $('movementNote').value = '';
    renderMovementProductOptions();
    openModal('movementModal');
  }

  function renderCashierProducts() {
    $('cashierProduct').innerHTML = '<option value="">Pilih barang</option>' + [...state.items]
      .filter((item) => Number(item.stock) > 0)
      .sort(expiryOrder)
      .map((item) => `<option value="${escapeHTML(item.id)}">${escapeHTML(item.name)} — stok ${Number(item.stock)} ${escapeHTML(item.unit)} · ${formatMoney(item.price)}</option>`).join('');
  }

  function renderCart() {
    $('cartTable').innerHTML = cart.map((line, index) => `<tr>
      <td><span class="item-name">${escapeHTML(line.name)}</span></td><td>${formatMoney(line.price)}</td>
      <td>${Number(line.qty)} ${escapeHTML(line.unit)}</td><td>${formatMoney(line.price * line.qty)}</td>
      <td><button type="button" class="small-action" data-remove-cart="${index}" aria-label="Hapus ${escapeHTML(line.name)} dari keranjang">×</button></td></tr>`).join('');
    $('cartEmpty').classList.toggle('hidden', cart.length > 0);
    $('cartTotal').textContent = formatMoney(cart.reduce((sum, line) => sum + line.price * line.qty, 0));
  }

  function openCashier() {
    if (!state.items.some((item) => Number(item.stock) > 0)) {
      showToast('Belum ada stok tersedia untuk dijual.');
      return;
    }
    cart = [];
    $('cashierCustomer').value = '';
    $('cashierQty').value = '1';
    renderCashierProducts();
    renderCart();
    openModal('cashierModal');
  }

  function showReceipt(sale) {
    if (!sale) return;
    $('receiptContent').innerHTML = `<div class="receipt-brand"><strong>MEDISTOCK</strong><span>APOTEK</span></div>
      <div class="receipt-meta"><div>No. struk <strong>${escapeHTML(sale.number)}</strong></div>
      <div>Tanggal <strong>${formatDate(sale.date)} ${escapeHTML(sale.time || '')}</strong></div>
      <div>Pelanggan <strong>${escapeHTML(sale.customer || 'Pelanggan umum')}</strong></div></div>
      <div class="receipt-lines">${sale.items.map((line) => `<div class="receipt-line"><span>${escapeHTML(line.name)}<small>${Number(line.qty)} × ${formatMoney(line.price)}</small></span><strong>${formatMoney(line.qty * line.price)}</strong></div>`).join('')}</div>
      <div class="receipt-grand-total"><span>TOTAL</span><strong>${formatMoney(sale.total)}</strong></div>
      <p class="receipt-thanks">Terima kasih telah berbelanja</p>`;
    $('receiptModal').dataset.saleId = sale.id;
    openModal('receiptModal');
  }

  function renderSales() {
    const sales = state.sales.filter((sale) => (!reportRange.from || sale.date >= reportRange.from) && (!reportRange.to || sale.date <= reportRange.to))
      .sort((a, b) => `${b.date || ''}${b.createdAt || ''}`.localeCompare(`${a.date || ''}${a.createdAt || ''}`));
    $('salesTable').innerHTML = sales.map((sale) => `<tr><td>${formatDate(sale.date)}</td><td>${escapeHTML(sale.number)}</td>
      <td>${escapeHTML(sale.customer || 'Pelanggan umum')}</td><td>${sale.items.reduce((sum, line) => sum + Number(line.qty || 0), 0)} item</td>
      <td class="stock-cell">${formatMoney(sale.total)}</td><td><button type="button" class="button button-outline reprint-button" data-receipt="${escapeHTML(sale.id)}">Cetak struk</button></td></tr>`).join('');
    $('salesEmpty').classList.toggle('hidden', sales.length > 0);
  }

  function printReceipt() {
    const receipt = $('receiptContent').innerHTML;
    const printWindow = window.open('', '_blank', 'width=420,height=700');
    if (!printWindow) {
      showToast('Izinkan pop-up browser untuk mencetak struk.');
      return;
    }
    printWindow.document.open();
    printWindow.document.write(`<!doctype html><html lang="id"><head><meta charset="utf-8"><title>Struk Medistock</title><style>body{font:14px Arial,sans-serif;color:#222;max-width:340px;margin:24px auto;padding:12px}.receipt-brand{text-align:center;padding-bottom:14px;border-bottom:1px dashed #888}.receipt-brand strong,.receipt-brand span{display:block}.receipt-brand strong{font-size:20px}.receipt-brand span{font-size:11px;letter-spacing:2px;margin-top:4px}.receipt-meta{padding:12px 0;border-bottom:1px dashed #888}.receipt-meta div{display:flex;justify-content:space-between;gap:10px;margin:6px 0;font-size:12px}.receipt-meta strong{text-align:right}.receipt-lines{padding:10px 0;border-bottom:1px dashed #888}.receipt-line{display:flex;justify-content:space-between;gap:12px;margin:8px 0;font-size:12px}.receipt-line small{display:block;color:#666;margin-top:3px}.receipt-grand-total{display:flex;justify-content:space-between;font-size:16px;font-weight:bold;padding-top:12px}.receipt-thanks{text-align:center;font-size:12px;margin-top:22px}@media print{body{margin:0 auto}}</style></head><body>${receipt}<script>window.onload=()=>{window.print();window.onafterprint=()=>window.close();};<\/script></body></html>`);
    printWindow.document.close();
  }

  function downloadCSV(filename, rows) {
    const csv = rows.map((row) => row.map((value) => `"${String(value ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const blob = new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function exportInventory() {
    const rows = [['Nama barang', 'Kategori', 'No. batch', 'Stok', 'Satuan', 'Harga jual/unit (Rp)', 'Tanggal kedaluwarsa', 'Status']];
    [...state.items].sort(expiryOrder).forEach((item) => rows.push([item.name, item.category, item.batch || '', item.stock, item.unit, item.price || 0, item.expiry || '', expiryStatus(item)]));
    downloadCSV(`data-barang-${todayISO()}.csv`, rows);
  }

  function exportReport() {
    const movements = getReportMovements();
    const rows = [['Tanggal', 'Nama barang', 'Jenis', 'Jumlah', 'Satuan', 'Harga/unit (Rp)', 'Total (Rp)', 'No. batch', 'Keterangan', 'No. struk']];
    movements.forEach((movement) => {
      const item = state.items.find((entry) => entry.id === movement.itemId);
      rows.push([movement.date, movement.itemName || (item && item.name) || 'Barang dihapus', movement.type === 'in' ? 'Masuk' : 'Keluar', movement.qty, movement.unit || (item && item.unit) || '', movement.unitPrice || 0, movement.total || 0, movement.batch || (item && item.batch) || '', movement.note || '', movement.saleId || '']);
    });
    downloadCSV(`laporan-medistock-${todayISO()}.csv`, rows);
  }

  document.querySelectorAll('.nav-link').forEach((button) => button.addEventListener('click', () => {
    const action = button.dataset.action;
    if (action === 'out') {
      $('sidebar').classList.remove('open');
      openMovementForm('out');
      return;
    }
    if (action === 'cashier') {
      $('sidebar').classList.remove('open');
      openCashier();
      return;
    }
    navigate(button.dataset.page);
  }));
  document.querySelectorAll('[data-go]').forEach((button) => button.addEventListener('click', () => navigate(button.dataset.go)));
  $('dashboardReportBtn').addEventListener('click', () => navigate('reports'));
  $('mobileMenu').addEventListener('click', () => $('sidebar').classList.toggle('open'));
  $('topAddBtn').addEventListener('click', () => { navigate('inventory'); openItemForm(); });
  $('addItemBtn').addEventListener('click', () => openItemForm());
  $('inBtn').addEventListener('click', () => openMovementForm('in'));

  document.querySelectorAll('[data-close]').forEach((button) => button.addEventListener('click', () => closeModal(button.dataset.close)));
  document.querySelectorAll('.modal-backdrop').forEach((backdrop) => backdrop.addEventListener('click', (event) => {
    if (event.target === backdrop) closeModal(backdrop.id);
  }));
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') document.querySelectorAll('.modal-backdrop:not(.hidden)').forEach((modal) => closeModal(modal.id));
  });

  $('itemForm').addEventListener('submit', (event) => {
    event.preventDefault();
    const id = $('itemId').value;
    const oldItem = state.items.find((entry) => entry.id === id);
    const item = {
      id: id || makeId(),
      name: $('itemName').value.trim(),
      category: $('itemCategory').value.trim(),
      batch: $('itemBatch').value.trim(),
      stock: Number($('itemStock').value),
      unit: $('itemUnit').value,
      price: Number($('itemPrice').value),
      expiry: $('itemExpiry').value
    };
    if (!item.name || !item.category || !Number.isInteger(item.stock) || item.stock < 0 || !Number.isFinite(item.price) || item.price < 0) {
      showToast('Periksa kembali data barang.');
      return;
    }
    const index = state.items.findIndex((entry) => entry.id === id);
    if (index >= 0) {
      // Perubahan harga/nama tidak mengubah data historis struk yang sudah tersimpan.
      state.items[index] = { ...oldItem, ...item };
    } else {
      state.items.push(item);
    }
    saveState();
    closeModal('itemModal');
    renderAll();
    showToast(index >= 0 ? 'Data barang berhasil diperbarui.' : 'Barang berhasil ditambahkan.');
  });

  $('inventoryTable').addEventListener('click', (event) => {
    const editButton = event.target.closest('[data-edit-item]');
    const deleteButton = event.target.closest('[data-delete-item]');
    if (editButton) {
      const item = state.items.find((entry) => entry.id === editButton.dataset.editItem);
      if (item) openItemForm(item);
    }
    if (deleteButton) {
      const item = state.items.find((entry) => entry.id === deleteButton.dataset.deleteItem);
      if (!item) return;
      if (!window.confirm(`Hapus barang “${item.name}”? Riwayat transaksinya tetap disimpan.`)) return;
      state.items = state.items.filter((entry) => entry.id !== item.id);
      saveState();
      renderAll();
      showToast('Barang berhasil dihapus.');
    }
  });

  $('movementForm').addEventListener('submit', (event) => {
    event.preventDefault();
    const item = state.items.find((entry) => entry.id === $('movementProduct').value);
    const type = $('movementType').value;
    const qty = Number($('movementQty').value);
    if (!item || !Number.isInteger(qty) || qty < 1) {
      showToast('Pilih barang dan masukkan jumlah yang valid.');
      return;
    }
    if (type === 'out' && qty > Number(item.stock)) {
      showToast(`Stok tidak cukup. Stok tersedia ${item.stock} ${item.unit}.`);
      return;
    }
    const date = $('movementDate').value;
    if (!date) {
      showToast('Tanggal transaksi wajib diisi.');
      return;
    }
    const batch = type === 'in' && $('movementBatch').value.trim() ? $('movementBatch').value.trim() : item.batch;
    const expiry = type === 'in' && $('movementExpiry').value ? $('movementExpiry').value : item.expiry;
    item.stock += type === 'in' ? qty : -qty;
    if (type === 'in') {
      if ($('movementBatch').value.trim()) item.batch = $('movementBatch').value.trim();
      if ($('movementExpiry').value) item.expiry = $('movementExpiry').value;
    }
    state.movements.push({
      id: makeId(), itemId: item.id, itemName: item.name, type, qty, date,
      batch: batch || '', expiry: expiry || '', unit: item.unit,
      unitPrice: type === 'out' ? Number(item.price || 0) : 0,
      total: type === 'out' ? Number(item.price || 0) * qty : 0,
      note: $('movementNote').value.trim(), createdAt: new Date().toISOString()
    });
    saveState();
    closeModal('movementModal');
    renderAll();
    showToast(type === 'in' ? 'Barang masuk berhasil dicatat.' : 'Barang keluar berhasil dicatat.');
  });

  $('addCartBtn').addEventListener('click', () => {
    const item = state.items.find((entry) => entry.id === $('cashierProduct').value);
    const qty = Number($('cashierQty').value);
    if (!item || !Number.isInteger(qty) || qty < 1) {
      showToast('Pilih barang dan masukkan jumlah yang valid.');
      return;
    }
    const inCart = cart.find((line) => line.itemId === item.id);
    const requestedQty = qty + (inCart ? inCart.qty : 0);
    if (requestedQty > Number(item.stock)) {
      showToast(`Stok ${item.name} tidak cukup. Tersedia ${item.stock} ${item.unit}.`);
      return;
    }
    if (inCart) inCart.qty += qty;
    else cart.push({ itemId: item.id, name: item.name, unit: item.unit, price: Number(item.price || 0), qty });
    $('cashierQty').value = '1';
    renderCart();
  });

  $('cartTable').addEventListener('click', (event) => {
    const removeButton = event.target.closest('[data-remove-cart]');
    if (!removeButton) return;
    cart.splice(Number(removeButton.dataset.removeCart), 1);
    renderCart();
  });

  $('checkoutBtn').addEventListener('click', () => {
    if (!cart.length) {
      showToast('Keranjang masih kosong.');
      return;
    }
    // Validasi ulang stok agar tidak pernah menjual melebihi stok tersisa.
    for (const line of cart) {
      const item = state.items.find((entry) => entry.id === line.itemId);
      if (!item || Number(item.stock) < line.qty) {
        showToast(`Stok ${line.name} berubah dan tidak mencukupi. Periksa keranjang.`);
        renderCashierProducts();
        return;
      }
    }
    const now = new Date();
    const date = todayISO();
    const saleId = makeId();
    const number = `STR-${date.replace(/-/g, '')}-${String(Date.now()).slice(-6)}`;
    const saleItems = cart.map((line) => ({ ...line }));
    const total = saleItems.reduce((sum, line) => sum + line.price * line.qty, 0);
    const sale = {
      id: saleId,
      number,
      date,
      time: new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit' }).format(now),
      customer: $('cashierCustomer').value.trim() || 'Pelanggan umum',
      items: saleItems,
      total,
      createdAt: now.toISOString()
    };
    saleItems.forEach((line) => {
      const item = state.items.find((entry) => entry.id === line.itemId);
      item.stock -= line.qty;
      state.movements.push({
        id: makeId(), itemId: item.id, itemName: line.name, type: 'out', qty: line.qty, date,
        batch: item.batch || '', expiry: item.expiry || '', unit: line.unit,
        unitPrice: line.price, total: line.price * line.qty, saleId, note: `Penjualan kasir ${number}`, createdAt: now.toISOString()
      });
    });
    state.sales.push(sale);
    saveState();
    cart = [];
    closeModal('cashierModal');
    renderAll();
    showReceipt(sale);
    showToast('Pembayaran berhasil. Stok telah dikurangi.');
  });

  $('salesTable').addEventListener('click', (event) => {
    const button = event.target.closest('[data-receipt]');
    if (!button) return;
    showReceipt(state.sales.find((sale) => sale.id === button.dataset.receipt));
  });
  $('printReceiptBtn').addEventListener('click', printReceipt);

  ['inventorySearch', 'statusFilter'].forEach((id) => $(id).addEventListener(id === 'inventorySearch' ? 'input' : 'change', renderInventory));
  ['movementSearch', 'movementTypeFilter', 'movementDateFilter'].forEach((id) => $(id).addEventListener(id === 'movementSearch' ? 'input' : 'change', renderMovements));
  $('inventoryCsv').addEventListener('click', exportInventory);
  $('reportCsv').addEventListener('click', exportReport);
  $('applyReport').addEventListener('click', () => {
    const from = $('reportFrom').value;
    const to = $('reportTo').value;
    if (from && to && from > to) {
      showToast('Tanggal awal tidak boleh melewati tanggal akhir.');
      return;
    }
    reportRange = { from, to };
    renderReports();
  });
  $('clearReport').addEventListener('click', () => {
    $('reportFrom').value = '';
    $('reportTo').value = '';
    reportRange = { from: '', to: '' };
    renderReports();
  });

  $('todayLabel').textContent = new Intl.DateTimeFormat('id-ID', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date());
  $('yearNow').textContent = new Date().getFullYear();
  renderAll();
})();
