import { createClient } from '[https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm](https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm)';

// Bind lucide to window just in case
const lucide = window.lucide;

// ---------------------------------------------------------
// SUPABASE SETUP
// ---------------------------------------------------------
const supabaseUrl = '[https://oemwgwuzxzeiflrphbkn.supabase.co](https://oemwgwuzxzeiflrphbkn.supabase.co)';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9lbXdnd3V6eHplaWZscnBoYmtuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE4MzMwNzcsImV4cCI6MjA4NzQwOTA3N30.Qe9RHx3Nb4_gt5SQfWCAmyzxSjzYokZrwk8zbopc4FQ';

let supabase;
try {
    if (supabaseUrl.startsWith('YOUR')) throw new Error("Missing config");
    supabase = createClient(supabaseUrl, supabaseKey);
} catch (e) {
    console.warn("Supabase tidak berjaya dikonfigurasi. Menggunakan data Mock (Simulasi).", e);
    supabase = null;
}

// Global State
const state = {
    user: null,
    isAdmin: false,
    customers: [],
    sales: [],
    restocks: [],
    debtPayments: [],
    salary: [],
    others: [],
    currentReportStr: ''
};

// ---------------------------------------------------------
// UTILITIES
// ---------------------------------------------------------
const q = (sel) => document.querySelector(sel);

// Format Currency correctly (e.g. 1,200.50)
const formatRM = (val) => {
    return Number(val || 0).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

// Get local Date YYYY-MM-DD reliably avoiding UTC shifts
const todayStr = () => {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().split('T')[0];
};

// Create the Application Object and attach to Window for inline HTML onclick handlers
const app = (window.app = {
    showToast(msg, type = 'success') {
        const toast = document.createElement('div');
        const isError = type === 'error';
        toast.className = `toast p-4 rounded-xl shadow-lg text-white font-medium text-sm flex items-start gap-3 ${isError ? 'bg-rose-600' : 'bg-slate-800'}`;
        
        const icon = isError ? 'alert-circle' : 'check-circle';
        const iconColor = isError ? 'text-white' : 'text-emerald-400';
        
        toast.innerHTML = `
            <div class="mt-0.5"><i data-lucide="${icon}" class="w-5 h-5 ${iconColor}"></i></div>
            <div class="flex-1 leading-snug">${msg}</div>
        `;
        q('#toast-container').appendChild(toast);
        lucide?.createIcons({ root: toast });
        setTimeout(() => {
            toast.classList.add('hide');
            setTimeout(() => toast.remove(), 300);
        }, 3500);
    },

    showModal(id) { 
        const m = q('#' + id);
        if(m) {
            m.classList.remove('hidden');
            // auto reset specific forms if needed
            if(id === 'modal-sale' && q('#f_sale_date')) q('#f_sale_date').value = todayStr();
        }
    },
    hideModal(id) { 
        q('#' + id)?.classList.add('hidden'); 
        // reset form inside modal when closed
        const form = q('#' + id + ' form');
        if(form) form.reset();
    },
    toggleCollapse(id) { 
        const el = q('#' + id);
        if(el) {
            el.classList.toggle('hidden');
            const icon = el.previousElementSibling.querySelector('[data-lucide]');
            if (icon) {
                icon.setAttribute('data-lucide', el.classList.contains('hidden') ? 'chevron-down' : 'chevron-up');
                lucide?.createIcons({ root: el.previousElementSibling });
            }
        }
    },

    // Routing
    navigate() {
        const hash = window.location.hash || '#/sales';
        const targetView = hash.replace('#/', '');

        // Hide all views
        document.querySelectorAll('.view-section').forEach(el => el.classList.add('hidden'));
        
        // Update Nav Links (Desktop & Mobile)
        document.querySelectorAll('.nav-link').forEach(el => {
            // Reset mobile & desktop states
            el.classList.remove('bg-slate-800', 'text-white', 'text-blue-600');
            if (window.innerWidth < 768) {
                el.classList.add('text-slate-400');
            } else {
                el.classList.remove('text-white');
            }

            // Set Active
            if (el.dataset.target === targetView) {
                if (window.innerWidth >= 768) {
                    el.classList.add('bg-slate-800', 'text-white');
                } else {
                    el.classList.remove('text-slate-400');
                    el.classList.add('text-blue-600');
                }
            }
        });

        // Handle Admin View specifically
        if (targetView === 'admin') {
            q('#view-admin')?.classList.remove('hidden');
            if (state.isAdmin) {
                q('#admin-login')?.classList.add('hidden');
                q('#admin-content')?.classList.remove('hidden');
                app.switchAdminTab('customers');
                app.loadAdminData();
            } else {
                q('#admin-login')?.classList.remove('hidden');
                q('#admin-content')?.classList.add('hidden');
            }
        } else {
            const viewId = 'view-' + targetView;
            q('#' + viewId)?.classList.remove('hidden');
        }
        
        // Refresh Icons when navigating to ensure dynamically inserted content shows icons
        setTimeout(() => lucide?.createIcons(), 50);
    },

    switchAdminTab(tab) {
        document.querySelectorAll('.adm-tab-content').forEach(el => el.classList.add('hidden'));
        document.querySelectorAll('.adm-tab-btn').forEach(el => {
            el.classList.remove('bg-slate-800', 'text-white');
            el.classList.add('bg-transparent', 'text-slate-600');
            
            if (el.dataset.tab === tab) {
                el.classList.remove('bg-transparent', 'text-slate-600');
                el.classList.add('bg-slate-800', 'text-white');
            }
        });
        q('#adm-' + tab)?.classList.remove('hidden');
    },

    // Authentication
    async checkAuth() {
        if (!supabase) {
            q('#offline-badge').classList.remove('hidden');
            return;
        }
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (session) {
                state.user = session.user;
                state.isAdmin = true;
                q('#desktop-user-info')?.classList.remove('hidden');
            }
        } catch(e) { console.error("Session error", e); }
    },

    async handleLogin(e) {
        e.preventDefault();
        const btn = q('#btn-login');
        if (btn) btn.innerText = "Sila tunggu...";

        const email = q('#login-email')?.value;
        const password = q('#login-pwd')?.value;

        if (!supabase) {
            // Offline / Mock fallback
            if (email === 'admin@gastanjung.com' || email === 'admin@gmail.com') {
                app.showToast("Mod Simula (Offline) Aktif. Log Masuk Berjaya.", "success");
                state.isAdmin = true;
                state.user = { email };
                q('#desktop-user-info')?.classList.remove('hidden');
                app.navigate();
                app.loadAdminData();
            } else {
                app.showToast("Sila guna admin@gastanjung.com untuk mod simula", "error");
            }
            if (btn) btn.innerText = "Log Masuk Sistem";
            return;
        }

        const { error } = await supabase.auth.signInWithPassword({ email, password });

        if (error && (email === 'admin@gmail.com' || email === 'admin@gastanjung.com') && (password === 'Tanjung1234' || password === '123456')) {
            // Fallback to offline mode intentionally if demo credentials used but DB fails
            app.showToast("Sistem Pangkalan Data lambat. Mod Bypass Aktif.", "success");
            state.isAdmin = true;
            state.user = { email };
            q('#desktop-user-info')?.classList.remove('hidden');
            app.navigate();
            app.loadAdminData();
            if (btn) btn.innerText = "Log Masuk Sistem";
            return;
        } else if (error) {
            app.showToast("Ralat Log Masuk: " + error.message, "error");
            if (btn) btn.innerText = "Log Masuk Sistem";
            return;
        }

        await app.checkAuth();
        app.showToast("Berjaya Log Masuk", "success");
        app.navigate();
        app.loadAdminData();
        if (btn) btn.innerText = "Log Masuk Sistem";
    },

    async logout() {
        if (supabase) await supabase.auth.signOut();
        state.user = null;
        state.isAdmin = false;
        q('#desktop-user-info')?.classList.add('hidden');
        window.location.hash = '#/sales';
        app.showToast("Telah log keluar dengan selamat");
    },

    // Data Fetching & Sync
    async initData() {
        // Initialize date pickers to today
        const t = todayStr();
        ['f_sale_date', 'r_date', 's_date', 'm_date', 'rep-start', 'rep-end'].forEach(id => {
            const el = q('#' + id);
            if (el) el.value = t;
        });
        
        // Adjust rep-start to beginning of current month
        const startMonth = new Date();
        startMonth.setDate(1);
        startMonth.setMinutes(startMonth.getMinutes() - startMonth.getTimezoneOffset());
        if(q('#rep-start')) q('#rep-start').value = startMonth.toISOString().split('T')[0];

        if (!supabase) {
            app.mockData();
            app.renderAll();
            return;
        }

        try {
            const [cRes, sRes, rRes, dpRes] = await Promise.all([
                supabase.from('customers').select('*').order('name'),
                supabase.from('sales').select('*, customers(name)').order('date', { ascending: false }),
                supabase.from('restocks').select('*').order('date', { ascending: false }),
                supabase.from('debt_payments').select('*, customers(name)').order('date', { ascending: false })
            ]);

            if (cRes.error) throw cRes.error;
            if (sRes.error) throw sRes.error;

            state.customers = cRes.data || [];
            state.sales = sRes.data || [];
            state.restocks = rRes.data || [];
            state.debtPayments = dpRes.data || [];

            app.renderAll();
        } catch (err) {
            console.error("Ralat Data:", err);
            app.showToast("Gagal menyambung ke pangkalan data. Beralih ke data simula.", "error");
            q('#offline-badge').classList.remove('hidden');
            supabase = null; // force mock
            app.mockData();
            app.renderAll();
        }
    },

    async loadAdminData() {
        if (!supabase) {
            app.renderAdminTables();
            return;
        }
        try {
            const [salRes, othRes] = await Promise.all([
                supabase.from('staff_salary').select('*').order('date', { ascending: false }),
                supabase.from('capital_others').select('*').order('date', { ascending: false })
            ]);
            state.salary = salRes.data || [];
            state.others = othRes.data || [];
            app.renderAdminTables();
        } catch(err) {
            console.error(err);
        }
    },

    // Renders
    renderAll() {
        app.updateMonitoring();
        app.renderSales();
        app.renderRestocks();
        app.renderHutang();

        const custOpts = '<option value="">-- Sila Pilih Pelanggan --</option>' +
            state.customers.map(c => `<option value="${c.id}">${c.name} (${c.category})</option>`).join('');

        if (q('#f_sale_cust')) q('#f_sale_cust').innerHTML = custOpts;
        
        // Render icons globally after all renders
        setTimeout(() => lucide?.createIcons(), 50);
    },

    updateMonitoring() {
        let stock14 = 0, stock12 = 0, stockInd = 0;
        let sold14 = 0, sold12 = 0, soldInd = 0;
        const today = todayStr();

        state.restocks.forEach(r => {
            stock14 += Number(r.qty_14kg || 0);
            stock12 += Number(r.qty_12kg || 0);
            stockInd += Number(r.qty_industri || 0);
        });

        state.sales.forEach(s => {
            const s14 = Number(s.qty_14kg || 0);
            const s12 = Number(s.qty_12kg || 0);
            const si = Number(s.qty_industri || 0);

            stock14 -= s14;
            stock12 -= s12;
            stockInd -= si;

            if (s.date === today) {
                sold14 += s14;
                sold12 += s12;
                soldInd += si;
            }
        });

        // Formatting large numbers with commas if needed, though stocks are usually < 1000
        if (q('#stk-14')) q('#stk-14').innerText = formatRM(stock14).replace('.00','');
        if (q('#stk-12')) q('#stk-12').innerText = formatRM(stock12).replace('.00','');
        if (q('#stk-ind')) q('#stk-ind').innerText = formatRM(stockInd).replace('.00','');
        
        if (q('#t-sold-14')) q('#t-sold-14').innerText = formatRM(sold14).replace('.00','');
        if (q('#t-sold-12')) q('#t-sold-12').innerText = formatRM(sold12).replace('.00','');
        if (q('#t-sold-ind')) q('#t-sold-ind').innerText = formatRM(soldInd).replace('.00','');
    },

    renderSales() {
        const tbody = q('#tbl-sales');
        if (!tbody) return;

        if (state.sales.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" class="p-6 text-center text-slate-400 italic">Tiada rekod jualan ditemui.</td></tr>`;
            return;
        }

        tbody.innerHTML = state.sales.slice(0, 50).map(s => {
            const total =
                (Number(s.qty_14kg || 0) * Number(s.paid_price_14kg || 0)) +
                (Number(s.qty_12kg || 0) * Number(s.paid_price_12kg || 0)) +
                (Number(s.qty_industri || 0) * Number(s.paid_price_industri || 0));

            // Build small badge strings for qty
            let qtyHtml = '';
            if(s.qty_14kg > 0) qtyHtml += `<span class="inline-block bg-red-100 text-red-700 px-1.5 py-0.5 rounded text-[10px] font-bold mr-1 border border-red-200">${s.qty_14kg}x Merah</span>`;
            if(s.qty_12kg > 0) qtyHtml += `<span class="inline-block bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded text-[10px] font-bold mr-1 border border-blue-200">${s.qty_12kg}x Biru</span>`;
            if(s.qty_industri > 0) qtyHtml += `<span class="inline-block bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded text-[10px] font-bold border border-orange-200">${s.qty_industri}x Ind</span>`;

            const dateObj = new Date(s.date);
            const dateStr = `${dateObj.getDate().toString().padStart(2,'0')}/${(dateObj.getMonth()+1).toString().padStart(2,'0')}/${dateObj.getFullYear()}`;

            const statusHtml = s.is_credit 
                ? '<span class="bg-red-50 border border-red-200 text-red-600 px-2 py-1 rounded-full text-[10px] font-bold tracking-wider flex items-center justify-center gap-1 w-max mx-auto"><i data-lucide="clock" class="w-3 h-3"></i> HUTANG</span>' 
                : '<span class="bg-emerald-50 border border-emerald-200 text-emerald-600 px-2 py-1 rounded-full text-[10px] font-bold tracking-wider flex items-center justify-center gap-1 w-max mx-auto"><i data-lucide="check-circle-2" class="w-3 h-3"></i> LUNAS</span>';

            return `<tr class="hover:bg-slate-50 transition-colors group">
                <td class="p-4 border-b border-slate-100 align-middle">
                    <div class="font-bold text-slate-800">${dateStr}</div>
                    <div class="text-[10px] text-slate-400 font-mono tracking-wider">${s.receipt_no || '-'}</div>
                </td>
                <td class="p-4 border-b border-slate-100 align-middle font-medium text-slate-700">${s.customers?.name || 'Pelanggan Umum'}</td>
                <td class="p-4 border-b border-slate-100 align-middle">${qtyHtml || '-'}</td>
                <td class="p-4 border-b border-slate-100 align-middle text-right font-bold text-slate-800">RM ${formatRM(total)}</td>
                <td class="p-4 border-b border-slate-100 align-middle">${statusHtml}</td>
                <td class="p-4 border-b border-slate-100 align-middle text-center">
                    <button onclick="app.printSaleReceipt('${s.id}')" class="text-slate-400 hover:text-blue-600 p-2 rounded hover:bg-blue-50 transition" title="Cetak Resit">
                        <i data-lucide="printer" class="w-5 h-5"></i>
                    </button>
                    ${state.isAdmin ? `<button onclick="app.deleteRecord('sales', '${s.id}')" class="text-slate-400 hover:text-red-600 p-2 rounded hover:bg-red-50 transition ml-1" title="Padam Jualan"><i data-lucide="trash-2" class="w-5 h-5"></i></button>` : ''}
                </td>
            </tr>`;
        }).join('');
        
        lucide?.createIcons({ root: tbody });
    },

    renderRestocks() {
        const tbody = q('#tbl-restocks');
        if (!tbody) return;

        if (state.restocks.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" class="p-6 text-center text-slate-400 italic">Tiada rekod restock gas.</td></tr>`;
            return;
        }

        tbody.innerHTML = state.restocks.slice(0, 50).map(r => `
        <tr class="hover:bg-slate-50 transition-colors">
            <td class="p-4 border-b border-slate-100 font-medium">${r.date}</td>
            <td class="p-4 border-b border-slate-100">
                <div class="flex gap-2 text-[10px] font-bold">
                    <span class="text-red-600 bg-red-50 px-1 rounded">${r.qty_14kg}x</span> 
                    <span class="text-blue-600 bg-blue-50 px-1 rounded">${r.qty_12kg}x</span> 
                    <span class="text-orange-600 bg-orange-50 px-1 rounded">${r.qty_industri}x</span>
                </div>
            </td>
            <td class="p-4 border-b border-slate-100 text-xs text-slate-600">RM${formatRM(r.cost_14kg_per_tong)} / RM${formatRM(r.cost_12kg_per_tong)} / RM${formatRM(r.cost_industri_per_tong)}</td>
            <td class="p-4 border-b border-slate-100 text-xs text-slate-500 italic">${r.note || '-'}</td>
            <td class="p-4 border-b border-slate-100 text-center">
                <button onclick="app.deleteRecord('restocks', '${r.id}')" class="text-slate-400 hover:text-red-500 transition p-2 hover:bg-red-50 rounded-full"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
            </td>
        </tr>`).join('');
        
        lucide?.createIcons({ root: tbody });
    },

    renderHutang() {
        const outMap = {};
        state.customers.forEach(c => {
            outMap[c.id] = { id: c.id, name: c.name, category: c.category, b14: 0, b12: 0, bind: 0 };
        });

        state.sales.forEach(s => {
            if (s.is_credit && outMap[s.customer_id]) {
                outMap[s.customer_id].b14 += Number(s.qty_14kg || 0) * Number(s.paid_price_14kg || 0);
                outMap[s.customer_id].b12 += Number(s.qty_12kg || 0) * Number(s.paid_price_12kg || 0);
                outMap[s.customer_id].bind += Number(s.qty_industri || 0) * Number(s.paid_price_industri || 0);
            }
        });

        state.debtPayments.forEach(p => {
            if (outMap[p.customer_id]) {
                outMap[p.customer_id].b14 -= Number(p.amount_14kg || 0);
                outMap[p.customer_id].b12 -= Number(p.amount_12kg || 0);
                outMap[p.customer_id].bind -= Number(p.amount_industri || 0);
            }
        });

        const list = q('#list-penghutang');
        if (!list) return;

        list.innerHTML = '';
        let hasHutang = false;

        Object.values(outMap).forEach(o => {
            // avoid floating point precision issues
            const b14 = Math.max(0, o.b14);
            const b12 = Math.max(0, o.b12);
            const bind = Math.max(0, o.bind);
            const total = b14 + b12 + bind;
            
            if (total > 0.05) { // Threshold for tiny floats
                hasHutang = true;
                list.innerHTML += `
                <div class="border border-slate-200 p-4 rounded-xl hover:shadow-md hover:border-blue-200 transition-all bg-white flex flex-col sm:flex-row justify-between sm:items-center gap-4">
                    <div>
                        <div class="flex items-center gap-2 mb-1">
                            <p class="font-bold text-slate-800 text-lg">${o.name}</p>
                            <span class="text-[9px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded uppercase font-bold tracking-wider">${o.category || 'Umum'}</span>
                        </div>
                        <div class="flex gap-3 text-[11px] font-bold text-slate-500">
                            ${b14 > 0 ? `<span class="text-red-500">14kg: RM ${formatRM(b14)}</span>` : ''}
                            ${b12 > 0 ? `<span class="text-blue-500">12kg: RM ${formatRM(b12)}</span>` : ''}
                            ${bind > 0 ? `<span class="text-orange-500">Ind: RM ${formatRM(bind)}</span>` : ''}
                        </div>
                    </div>
                    <div class="flex items-center gap-4 border-t sm:border-t-0 pt-3 sm:pt-0 border-slate-100">
                        <div class="text-right">
                            <p class="text-[10px] text-slate-400 uppercase font-bold">Total Baki</p>
                            <p class="font-black text-rose-600 text-lg leading-none">RM ${formatRM(total)}</p>
                        </div>
                        <button onclick="app.showBayarPanel('${o.id}', ${b14}, ${b12}, ${bind})" class="bg-emerald-50 text-emerald-600 hover:bg-emerald-600 hover:text-white border border-emerald-200 px-4 py-2 text-sm rounded-lg font-bold shadow-sm transition flex items-center gap-1 active:scale-95">
                            Bayar <i data-lucide="chevron-right" class="w-4 h-4"></i>
                        </button>
                    </div>
                </div>`;
            }
        });

        if (!hasHutang) list.innerHTML = `
            <div class="text-center p-8 bg-slate-50 rounded-xl border border-dashed border-slate-300">
                <i data-lucide="smile" class="w-12 h-12 text-slate-300 mx-auto mb-2"></i>
                <p class="text-sm text-slate-500 font-medium">Bagus! Tiada pelanggan berhutang setakat ini.</p>
            </div>`;
            
        lucide?.createIcons({ root: list });
    },

    renderAdminTables() {
        const tCust = q('#tbl-customers');
        const tLedg = q('#tbl-ledger');
        const tSal = q('#tbl-salary');

        if (tCust) {
            tCust.innerHTML = state.customers.map(c => `
            <tr class="hover:bg-slate-50 transition-colors">
                <td class="p-4 border-b border-slate-100 font-bold text-slate-700">${c.name}</td>
                <td class="p-4 border-b border-slate-100"><span class="bg-slate-100 text-slate-600 text-[10px] uppercase px-2 py-1 rounded font-bold tracking-wider">${c.category}</span></td>
                <td class="p-4 border-b border-slate-100 text-center text-red-600 font-bold">RM${formatRM(c.price_14kg)}</td>
                <td class="p-4 border-b border-slate-100 text-center text-blue-600 font-bold">RM${formatRM(c.price_12kg)}</td>
                <td class="p-4 border-b border-slate-100 text-center text-orange-600 font-bold">RM${formatRM(c.price_industri)}</td>
                <td class="p-4 border-b border-slate-100 text-center"><button onclick="app.deleteRecord('customers', '${c.id}')" class="text-slate-400 hover:text-red-500 p-2 rounded-full hover:bg-red-50 transition"><i data-lucide="trash-2" class="w-4 h-4"></i></button></td>
            </tr>`).join('');
            lucide?.createIcons({ root: tCust });
        }

        if (tLedg) {
            tLedg.innerHTML = state.debtPayments.map(p => {
                const t = Number(p.amount_14kg || 0) + Number(p.amount_12kg || 0) + Number(p.amount_industri || 0);
                return `<tr class="hover:bg-slate-50 transition-colors">
                    <td class="p-4 border-b border-slate-100 font-medium">${p.date}<br><span class="text-[10px] text-slate-400 font-mono">${p.receipt_no || '-'}</span></td>
                    <td class="p-4 border-b border-slate-100 font-bold text-slate-700">${p.customers?.name || 'Umum'}</td>
                    <td class="p-4 border-b border-slate-100 font-black text-emerald-600 text-right text-lg">RM ${formatRM(t)}</td>
                    <td class="p-4 border-b border-slate-100 text-center"><span class="bg-slate-100 text-slate-600 px-2 py-1 text-[10px] font-bold uppercase rounded">${p.payment_type || '-'}</span></td>
                    <td class="p-4 border-b border-slate-100 text-center">
                        <button onclick="app.printPaymentReceipt('${p.id}')" class="text-slate-400 hover:text-blue-600 p-2 rounded-full hover:bg-blue-50 transition"><i data-lucide="printer" class="w-4 h-4"></i></button>
                        <button onclick="app.deleteRecord('debt_payments', '${p.id}')" class="text-slate-400 hover:text-red-500 p-2 rounded-full hover:bg-red-50 transition ml-1"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
                    </td>
                </tr>`;
            }).join('');
            lucide?.createIcons({ root: tLedg });
        }

        if (tSal) {
            tSal.innerHTML = state.salary.map(s => `<tr class="hover:bg-slate-50 transition-colors">
                <td class="p-4 border-b border-slate-100">${s.date}</td>
                <td class="p-4 border-b border-slate-100 font-bold text-slate-700">${s.staff_name}</td>
                <td class="p-4 border-b border-slate-100 font-bold text-indigo-600 text-right">RM ${formatRM(s.salary_amount)}</td>
                <td class="p-4 border-b border-slate-100 text-xs italic text-slate-500">${s.note || '-'}</td>
                <td class="p-4 border-b border-slate-100 text-center"><button onclick="app.deleteRecord('staff_salary', '${s.id}')" class="text-slate-400 hover:text-red-500 p-2 rounded-full hover:bg-red-50 transition"><i data-lucide="trash-2" class="w-4 h-4"></i></button></td>
            </tr>`).join('');
            lucide?.createIcons({ root: tSal });
        }
    },

    // Business Logic Methods
    autofillPrices() {
        const cid = q('#f_sale_cust')?.value;
        const cust = state.customers.find(c => c.id === cid);
        if (cust) {
            q('#f_sale_prc14').value = cust.price_14kg || 0;
            q('#f_sale_prc12').value = cust.price_12kg || 0;
            q('#f_sale_prcind').value = cust.price_industri || 0;
        }
    },

    calculateWAC(date) {
        // Weighted Average Cost for COGS
        let c14 = 0, q14 = 0, c12 = 0, q12 = 0, ci = 0, qi = 0;
        const pastRestocks = state.restocks.filter(r => r.date <= date);

        pastRestocks.forEach(r => {
            q14 += Number(r.qty_14kg || 0);
            c14 += Number(r.qty_14kg || 0) * Number(r.cost_14kg_per_tong || 0);

            q12 += Number(r.qty_12kg || 0);
            c12 += Number(r.qty_12kg || 0) * Number(r.cost_12kg_per_tong || 0);

            qi += Number(r.qty_industri || 0);
            ci += Number(r.qty_industri || 0) * Number(r.cost_industri_per_tong || 0);
        });

        return {
            w14: q14 ? (c14 / q14) : 0,
            w12: q12 ? (c12 / q12) : 0,
            wi: qi ? (ci / qi) : 0
        };
    },

    // Form Submissions
    async saveSale(e) {
        e.preventDefault();
        const btn = q('#btn-save-sale');
        if (btn) { btn.disabled = true; btn.innerHTML = '<i data-lucide="loader" class="w-4 h-4 animate-spin"></i> Menyimpan...'; lucide?.createIcons({root:btn}); }

        const payload = {
            date: q('#f_sale_date').value,
            customer_id: q('#f_sale_cust').value,
            qty_14kg: Number(q('#f_sale_qty14').value || 0),
            paid_price_14kg: Number(q('#f_sale_prc14').value || 0),
            qty_12kg: Number(q('#f_sale_qty12').value || 0),
            paid_price_12kg: Number(q('#f_sale_prc12').value || 0),
            qty_industri: Number(q('#f_sale_qtyind').value || 0),
            paid_price_industri: Number(q('#f_sale_prcind').value || 0),
            payment_type: q('#f_sale_ptype').value,
            is_credit: q('#f_sale_credit').checked,
            note: q('#f_sale_note').value
        };

        // Auto capture Cost of Goods Sold (COGS) at the time of sale
        const wac = app.calculateWAC(payload.date);
        payload.cost_snapshot_14kg = wac.w14;
        payload.cost_snapshot_12kg = wac.w12;
        payload.cost_snapshot_industri = wac.wi;

        if (!payload.customer_id) {
            app.showToast("Sila Pilih Pelanggan", "error");
            if (btn) { btn.disabled = false; btn.innerHTML = '<i data-lucide="printer" class="w-4 h-4"></i> Simpan & Resit'; lucide?.createIcons({root:btn}); }
            return;
        }
        
        if (payload.qty_14kg === 0 && payload.qty_12kg === 0 && payload.qty_industri === 0) {
             app.showToast("Kuantiti gas tidak boleh kosong semua", "error");
             if (btn) { btn.disabled = false; btn.innerHTML = '<i data-lucide="printer" class="w-4 h-4"></i> Simpan & Resit'; lucide?.createIcons({root:btn}); }
             return;
        }

        if (supabase) {
            const { data, error } = await supabase.from('sales').insert([payload]).select('*, customers(name)').single();
            if (error) {
                app.showToast("Ralat Simpan: " + error.message, "error");
                if (btn) { btn.disabled = false; btn.innerHTML = '<i data-lucide="printer" class="w-4 h-4"></i> Simpan & Resit'; lucide?.createIcons({root:btn}); }
                return;
            }
            state.sales.unshift(data);
            app.printSaleReceiptFromData(data);
        } else {
            payload.id = 'MOCK-S' + Date.now();
            payload.receipt_no = 'GT-SIM-001';
            payload.customers = state.customers.find(c => c.id === payload.customer_id);
            state.sales.unshift(payload);
            app.printSaleReceiptFromData(payload);
        }

        app.showToast("Jualan Berjaya Direkod");
        app.hideModal('modal-sale');
        app.renderAll();

        if (btn) { btn.disabled = false; btn.innerHTML = '<i data-lucide="printer" class="w-4 h-4"></i> Simpan & Resit'; lucide?.createIcons({root:btn}); }
    },

    async saveRestock(e) {
        e.preventDefault();
        const payload = {
            date: q('#r_date').value,
            qty_14kg: Number(q('#r_q14').value || 0),
            cost_14kg_per_tong: Number(q('#r_c14').value || 0),
            qty_12kg: Number(q('#r_q12').value || 0),
            cost_12kg_per_tong: Number(q('#r_c12').value || 0),
            qty_industri: Number(q('#r_qi').value || 0),
            cost_industri_per_tong: Number(q('#r_ci').value || 0),
            note: q('#r_note').value
        };

        if (supabase) {
            const { data, error } = await supabase.from('restocks').insert([payload]).select().single();
            if (error) { app.showToast(error.message, "error"); return; }
            state.restocks.unshift(data);
        } else {
            payload.id = 'MOCK-R' + Date.now();
            state.restocks.unshift(payload);
        }

        app.showToast("Stok Masuk Direkod");
        app.hideModal('modal-restock');
        app.renderAll();
    },

    async saveCustomer(e) {
        e.preventDefault();
        const payload = {
            name: q('#c_name').value,
            category: q('#c_cat').value,
            price_14kg: Number(q('#c_p14').value || 0),
            price_12kg: Number(q('#c_p12').value || 0),
            price_industri: Number(q('#c_pind').value || 0)
        };

        if (supabase) {
            const { data, error } = await supabase.from('customers').insert([payload]).select().single();
            if (error) { app.showToast(error.message, "error"); return; }
            state.customers.push(data);
            state.customers.sort((a, b) => a.name.localeCompare(b.name));
        } else {
            payload.id = 'MOCK-C' + Date.now();
            state.customers.push(payload);
        }

        app.showToast("Pelanggan Baharu Ditambah");
        app.hideModal('modal-customer');
        app.renderAll();
        if (state.isAdmin) app.renderAdminTables();
    },

    async saveSalary(e) {
        e.preventDefault();
        const payload = {
            date: q('#s_date').value,
            staff_name: q('#s_name').value,
            salary_amount: Number(q('#s_amt').value || 0),
            note: q('#s_note').value
        };

        if (supabase) {
            const { data, error } = await supabase.from('staff_salary').insert([payload]).select().single();
            if (error) { app.showToast(error.message, "error"); return; }
            state.salary.unshift(data);
        } else {
            payload.id = 'MOCK-SA' + Date.now();
            state.salary.unshift(payload);
        }

        app.showToast("Gaji Direkod");
        app.hideModal('modal-salary');
        if (state.isAdmin) app.renderAdminTables();
    },

    async saveModalLain(e) {
        e.preventDefault();
        const payload = {
            date: q('#m_date').value,
            type_modal: q('#m_type').value,
            amount: Number(q('#m_amt').value || 0),
            note: q('#m_note').value
        };

        if (supabase) {
            const { data, error } = await supabase.from('capital_others').insert([payload]).select().single();
            if (error) { app.showToast(error.message, "error"); return; }
            state.others.unshift(data);
        } else {
            payload.id = 'MOCK-M' + Date.now();
            state.others.unshift(payload);
        }

        app.showToast("Perbelanjaan Lain Direkod");
        app.hideModal('modal-modal');
        if (state.isAdmin) app.loadAdminData();
    },

    // Hutang Handlers
    showBayarPanel(cid, b14, b12, bind) {
        const cust = state.customers.find(c => c.id === cid);
        q('#bayar-hutang-title').innerText = `Terima Bayaran: ${cust?.name || '-'}`;
        q('#bh_customer_id').value = cid;
        
        q('#bh_baki_14').innerText = formatRM(b14);
        q('#bh_baki_12').innerText = formatRM(b12);
        q('#bh_baki_ind').innerText = formatRM(bind);

        // Auto-fill inputs if there's balance, makes it easier
        q('#bh_amt_14').value = b14 > 0 ? b14 : '';
        q('#bh_amt_12').value = b12 > 0 ? b12 : '';
        q('#bh_amt_ind').value = bind > 0 ? bind : '';

        const panel = q('#panel-bayar-hutang');
        if(panel) {
            panel.classList.remove('hidden');
            // Small delay to ensure it scrolls properly
            setTimeout(() => panel.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100);
        }
    },

    hideBayarPanel() {
        q('#panel-bayar-hutang')?.classList.add('hidden');
        q('#form-bayar-hutang')?.reset();
    },

    async handleBayarHutang(e) {
        e.preventDefault();

        const payload = {
            date: todayStr(),
            customer_id: q('#bh_customer_id').value,
            amount_14kg: Number(q('#bh_amt_14').value || 0),
            amount_12kg: Number(q('#bh_amt_12').value || 0),
            amount_industri: Number(q('#bh_amt_ind').value || 0),
            payment_type: q('#bh_payment_type').value,
            note: q('#bh_note').value
        };

        if (payload.amount_14kg === 0 && payload.amount_12kg === 0 && payload.amount_industri === 0) {
            app.showToast("Sila masukkan sekurang-kurangnya satu jumlah bayaran", "error");
            return;
        }

        if (supabase) {
            const { data, error } = await supabase.from('debt_payments').insert([payload]).select('*, customers(name)').single();
            if (error) { app.showToast(error.message, "error"); return; }
            state.debtPayments.unshift(data);
            app.printPaymentReceiptFromData(data);
        } else {
            payload.id = 'MOCK-P' + Date.now();
            payload.receipt_no = 'GT-REC-001';
            payload.customers = state.customers.find(c => c.id === payload.customer_id);
            state.debtPayments.unshift(payload);
            app.printPaymentReceiptFromData(payload);
        }

        app.showToast("Bayaran Diterima & Direkod", "success");
        app.hideBayarPanel();
        app.renderAll();
        if (state.isAdmin) app.loadAdminData();
    },

    // Deletion logic (Admin mostly)
    async deleteRecord(table, id) {
        if (!confirm("AMARAN: Adakah anda pasti mahu padam rekod ini secara kekal? Tindakan ini tidak boleh dipatahbalik.")) return;

        if (supabase) {
            const { error } = await supabase.from(table).delete().eq('id', id);
            if (error) { app.showToast(error.message, "error"); return; }
        }

        if (table === 'sales') state.sales = state.sales.filter(x => x.id !== id);
        if (table === 'restocks') state.restocks = state.restocks.filter(x => x.id !== id);
        if (table === 'customers') state.customers = state.customers.filter(x => x.id !== id);
        if (table === 'staff_salary') state.salary = state.salary.filter(x => x.id !== id);
        if (table === 'debt_payments') state.debtPayments = state.debtPayments.filter(x => x.id !== id);

        app.showToast("Rekod berjaya dipadam");
        app.renderAll();
        if (state.isAdmin) app.renderAdminTables();
    },

    // Printing Receipts (Thermal Printer Friendly)
    printSaleReceipt(id) {
        const s = state.sales.find(x => x.id === id);
        if (s) app.printSaleReceiptFromData(s);
    },

    printSaleReceiptFromData(s) {
        const total =
            (Number(s.qty_14kg || 0) * Number(s.paid_price_14kg || 0)) +
            (Number(s.qty_12kg || 0) * Number(s.paid_price_12kg || 0)) +
            (Number(s.qty_industri || 0) * Number(s.paid_price_industri || 0));

        let itemsHtml = '';
        if (Number(s.qty_14kg || 0) > 0) itemsHtml += `<tr><td style="padding:4px 0;">Gas 14kg (M)</td><td style="text-align:center;">${s.qty_14kg}</td><td style="text-align:right;">${formatRM(s.paid_price_14kg)}</td><td style="text-align:right;">${formatRM(Number(s.qty_14kg) * Number(s.paid_price_14kg))}</td></tr>`;
        if (Number(s.qty_12kg || 0) > 0) itemsHtml += `<tr><td style="padding:4px 0;">Gas 12kg (B)</td><td style="text-align:center;">${s.qty_12kg}</td><td style="text-align:right;">${formatRM(s.paid_price_12kg)}</td><td style="text-align:right;">${formatRM(Number(s.qty_12kg) * Number(s.paid_price_12kg))}</td></tr>`;
        if (Number(s.qty_industri || 0) > 0) itemsHtml += `<tr><td style="padding:4px 0;">Gas 50kg (I)</td><td style="text-align:center;">${s.qty_industri}</td><td style="text-align:right;">${formatRM(s.paid_price_industri)}</td><td style="text-align:right;">${formatRM(Number(s.qty_industri) * Number(s.paid_price_industri))}</td></tr>`;

        const html = `
            <div style="font-family:'Courier New', monospace; max-width: 300px; margin: 0 auto; text-align: center; color: black;">
                <h2 style="font-size:20px; font-weight:bold; margin: 0 0 5px 0;">GAS TANJUNG</h2>
                <p style="font-size:12px; margin:0 0 10px 0; font-weight:bold;">INVOIS JUALAN</p>
                
                <div style="text-align:left; font-size:12px; border-bottom:1px dashed #000; padding-bottom:10px; margin-bottom:10px;">
                    <p style="margin:2px 0;">Tarikh : ${s.date}</p>
                    <p style="margin:2px 0;">No Resit: ${s.receipt_no || '-'}</p>
                    <p style="margin:2px 0;">Syarikat: ${s.customers?.name || 'UMUM'}</p>
                </div>
                
                <table style="width:100%; font-size:12px; text-align:left; border-collapse: collapse; margin-bottom: 10px;">
                    <thead>
                        <tr style="border-bottom:1px dashed #000;">
                            <th style="padding-bottom:5px;">ITEM</th>
                            <th style="padding-bottom:5px; text-align:center;">QTY</th>
                            <th style="padding-bottom:5px; text-align:right;">HRG</th>
                            <th style="padding-bottom:5px; text-align:right;">JUM</th>
                        </tr>
                    </thead>
                    <tbody>${itemsHtml}</tbody>
                </table>
                
                <div style="text-align:right; font-size:16px; font-weight:bold; border-top:1px dashed #000; padding-top:10px; margin-top:10px;">
                    JUMLAH: RM ${formatRM(total)}
                </div>
                
                <div style="text-align:left; font-size:12px; margin-top:15px; border-top:1px dashed #000; padding-top:10px;">
                    <p style="margin:2px 0;">Cara Bayar : ${s.payment_type || '-'}</p>
                    ${s.is_credit ? '<p style="margin:5px 0; font-weight:bold; font-size:14px; background:#000; color:#fff; text-align:center; padding:3px;">*** STATUS: HUTANG ***</p>' : '<p style="margin:2px 0;">Status : LUNAS</p>'}
                    ${s.note ? `<p style="margin:2px 0;">Nota : ${s.note}</p>` : ''}
                </div>
                
                <p style="font-size:11px; margin-top:20px; text-align:center; font-weight:bold;">TERIMA KASIH!<br>Sila simpan resit untuk rujukan.</p>
            </div>`;

        q('#print-area').innerHTML = html;
        setTimeout(() => window.print(), 200);
    },

    printPaymentReceipt(id) {
        const p = state.debtPayments.find(x => x.id === id);
        if (p) app.printPaymentReceiptFromData(p);
    },

    printPaymentReceiptFromData(p) {
        const total =
            Number(p.amount_14kg || 0) +
            Number(p.amount_12kg || 0) +
            Number(p.amount_industri || 0);

        const html = `
            <div style="font-family:'Courier New', monospace; max-width: 300px; margin: 0 auto; text-align: center; color: black;">
                <h2 style="font-size:20px; font-weight:bold; margin: 0 0 5px 0;">GAS TANJUNG</h2>
                <p style="font-size:12px; margin:0 0 10px 0; font-weight:bold;">RESIT TERIMA BAYARAN HUTANG</p>
                
                <div style="text-align:left; font-size:12px; border-bottom:1px dashed #000; padding-bottom:10px; margin-bottom:10px;">
                    <p style="margin:2px 0;">Tarikh : ${p.date}</p>
                    <p style="margin:2px 0;">No Resit: ${p.receipt_no || '-'}</p>
                    <p style="margin:2px 0;">Terima Dari: ${p.customers?.name || 'UMUM'}</p>
                </div>
                
                <div style="text-align:left; font-size:12px; margin-bottom:10px;">
                    <p style="margin:4px 0; font-weight:bold; border-bottom:1px solid #ddd;">Pecahan Bayaran:</p>
                    ${Number(p.amount_14kg) > 0 ? `<p style="margin:2px 0; display:flex; justify-content:space-between;"><span>Gas 14kg:</span> <span>RM ${formatRM(p.amount_14kg)}</span></p>` : ''}
                    ${Number(p.amount_12kg) > 0 ? `<p style="margin:2px 0; display:flex; justify-content:space-between;"><span>Gas 12kg:</span> <span>RM ${formatRM(p.amount_12kg)}</span></p>` : ''}
                    ${Number(p.amount_industri) > 0 ? `<p style="margin:2px 0; display:flex; justify-content:space-between;"><span>Gas Industri:</span> <span>RM ${formatRM(p.amount_industri)}</span></p>` : ''}
                </div>
                
                <div style="text-align:right; font-size:16px; font-weight:bold; border-top:1px dashed #000; padding-top:10px; margin-top:10px;">
                    JUM DITERIMA: RM ${formatRM(total)}
                </div>
                
                <div style="text-align:left; font-size:12px; margin-top:15px; border-top:1px dashed #000; padding-top:10px;">
                    <p style="margin:2px 0;">Cara Bayar : ${p.payment_type || '-'}</p>
                    ${p.note ? `<p style="margin:2px 0;">Nota : ${p.note}</p>` : ''}
                </div>
                
                <p style="font-size:11px; margin-top:20px; text-align:center; font-weight:bold;">TERIMA KASIH!<br>Hutang anda telah dikemaskini.</p>
            </div>`;

        q('#print-area').innerHTML = html;
        setTimeout(() => window.print(), 200);
    },

    // Reports Logic
    generateReport() {
        const start = q('#rep-start')?.value || '2000-01-01';
        const end = q('#rep-end')?.value || '2099-12-31';

        let modalGas = 0, modalLain = 0, modalGaji = 0;
        let jualanKasar = 0, kosBarangDijual = 0;
        let hutangKasar = 0, bayaranHutang = 0;

        // 1. Kira semua bahagian Modal
        state.restocks.forEach(r => {
            if (r.date >= start && r.date <= end) {
                modalGas +=
                    (Number(r.qty_14kg || 0) * Number(r.cost_14kg_per_tong || 0)) +
                    (Number(r.qty_12kg || 0) * Number(r.cost_12kg_per_tong || 0)) +
                    (Number(r.qty_industri || 0) * Number(r.cost_industri_per_tong || 0));
            }
        });

        state.others.forEach(o => {
            if (o.date >= start && o.date <= end) modalLain += Number(o.amount || 0);
        });

        state.salary.forEach(s => {
            if (s.date >= start && s.date <= end) modalGaji += Number(s.salary_amount || 0);
        });

        // 2. Kira Untung & Hutang dari Rekod Jualan
        state.sales.forEach(s => {
            if (s.date >= start && s.date <= end) {
                const gross =
                    (Number(s.qty_14kg || 0) * Number(s.paid_price_14kg || 0)) +
                    (Number(s.qty_12kg || 0) * Number(s.paid_price_12kg || 0)) +
                    (Number(s.qty_industri || 0) * Number(s.paid_price_industri || 0));

                // Use snapshot costs saved at the time of sale for accurate COGS
                const cogs =
                    (Number(s.qty_14kg || 0) * Number(s.cost_snapshot_14kg || 0)) +
                    (Number(s.qty_12kg || 0) * Number(s.cost_snapshot_12kg || 0)) +
                    (Number(s.qty_industri || 0) * Number(s.cost_snapshot_industri || 0));

                jualanKasar += gross;
                kosBarangDijual += cogs;

                if (s.is_credit) hutangKasar += gross;
            }
        });

        // 3. Kira bayaran hutang yang diterima
        state.debtPayments.forEach(p => {
            if (p.date >= start && p.date <= end) {
                bayaranHutang +=
                    Number(p.amount_14kg || 0) +
                    Number(p.amount_12kg || 0) +
                    Number(p.amount_industri || 0);
            }
        });

        // Pengiraan akhir
        const untungKasar = jualanKasar - kosBarangDijual;
        const untungBersih = untungKasar - modalLain - modalGaji;
        const hutangBersih = Math.max(0, hutangKasar - bayaranHutang);

        // Papar ke UI
        q('#rep-modal-gas').innerText = `RM ${formatRM(modalGas)}`;
        q('#rep-modal-lain').innerText = `RM ${formatRM(modalLain)}`;
        q('#rep-modal-gaji').innerText = `RM ${formatRM(modalGaji)}`;

        q('#rep-untung-kasar').innerText = `RM ${formatRM(untungKasar)}`;
        q('#rep-untung-bersih').innerText = `RM ${formatRM(untungBersih)}`;

        q('#rep-hutang-kasar').innerText = `RM ${formatRM(hutangKasar)}`;
        q('#rep-hutang-bersih').innerText = `RM ${formatRM(hutangBersih)}`;

        q('#report-results')?.classList.remove('hidden');

        // Simpan CSV export string
        state.currentReportStr = 
            `Laporan Prestasi Perniagaan Gas Tanjung\n` +
            `Tarikh: ${start} hingga ${end}\n\n` +
            `--- PERBELANJAAN ---\n`+
            `Modal Gas (Stok Masuk),RM ${formatRM(modalGas)}\n` +
            `Perbelanjaan Lain-lain,RM ${formatRM(modalLain)}\n` +
            `Kos Gaji Staf,RM ${formatRM(modalGaji)}\n\n` +
            `--- KEUNTUNGAN ---\n` +
            `Jumlah Jualan Kasar,RM ${formatRM(jualanKasar)}\n` +
            `Kos Barang Dijual (COGS),RM ${formatRM(kosBarangDijual)}\n` +
            `Untung Kasar (Gross Profit),RM ${formatRM(untungKasar)}\n` +
            `Untung Bersih (Net Profit),RM ${formatRM(untungBersih)}\n\n` +
            `--- STATUS HUTANG ---\n` +
            `Jumlah Jualan Hutang (Baru),RM ${formatRM(hutangKasar)}\n` +
            `Bayaran Hutang Diterima,RM ${formatRM(bayaranHutang)}\n` +
            `Baki Hutang Bersih (P&L Jangka Masa Ini),RM ${formatRM(hutangBersih)}`;
    },

    exportCSV() {
        if (!state.currentReportStr) {
            return app.showToast("Sila Jana Laporan terlebih dahulu", "error");
        }

        // Add BOM for Excel utf-8 recognition
        const BOM = "\uFEFF"; 
        const csvContent = BOM + state.currentReportStr;

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);

        link.setAttribute("href", url);
        link.setAttribute("download", `Laporan_P&L_GasTanjung_${todayStr()}.csv`);
        link.style.visibility = 'hidden';

        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    },

    mockData() {
        state.customers = [
            { id: 'c1', name: 'Kedai Runcit Pak Ali', category: 'Runcit', price_14kg: 28, price_12kg: 24, price_industri: 150 },
            { id: 'c2', name: 'Restoran Tomyam Sedap', category: 'Restaurant', price_14kg: 27, price_12kg: 23, price_industri: 145 },
            { id: 'c3', name: 'Kilang Roti Ah Chong', category: 'Hotel', price_14kg: 26, price_12kg: 0, price_industri: 140 }
        ];

        state.restocks = [
            {
                id: 'r1',
                date: todayStr(),
                qty_14kg: 150, cost_14kg_per_tong: 22.50,
                qty_12kg: 80, cost_12kg_per_tong: 18.20,
                qty_industri: 20, cost_industri_per_tong: 110.00,
                note: 'Stok awal bulan'
            }
        ];

        state.sales = [
            {
                id: 's1',
                date: todayStr(),
                receipt_no: 'GT-001',
                customer_id: 'c1',
                customers: { name: 'Kedai Runcit Pak Ali' },
                qty_14kg: 10, paid_price_14kg: 28,
                qty_12kg: 5, paid_price_12kg: 24,
                qty_industri: 0, paid_price_industri: 0,
                payment_type: 'Tunai',
                is_credit: false,
                note: '',
                cost_snapshot_14kg: 22.50,
                cost_snapshot_12kg: 18.20,
                cost_snapshot_industri: 0
            },
            {
                id: 's2',
                date: todayStr(),
                receipt_no: 'GT-002',
                customer_id: 'c2',
                customers: { name: 'Restoran Tomyam Sedap' },
                qty_14kg: 0, paid_price_14kg: 0,
                qty_12kg: 0, paid_price_12kg: 0,
                qty_industri: 2, paid_price_industri: 145,
                payment_type: 'Belum Bayar',
                is_credit: true,
                note: 'Sila kutip mgu depan',
                cost_snapshot_14kg: 0,
                cost_snapshot_12kg: 0,
                cost_snapshot_industri: 110
            }
        ];

        state.debtPayments = [];
        state.salary = [
            { id: 'sa1', date: todayStr(), staff_name: 'Pemandu Abu', salary_amount: 1500, note: 'Gaji Asas' }
        ];
        state.others = [
            { id: 'o1', date: todayStr(), amount: 150, type_modal: 'Minyak Lori', note: 'Isi di Petronas' }
        ];
    }
});

// Initialize Router and Data
window.addEventListener('hashchange', app.navigate);

document.addEventListener('DOMContentLoaded', async () => {
    if (lucide) lucide.createIcons();
    await app.checkAuth();
    app.navigate();
    app.initData();
});
