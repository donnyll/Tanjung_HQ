import { createClient } from '[https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm](https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm)';

// ---------------------------------------------------------
// SUPABASE SETUP
// ---------------------------------------------------------
const supabaseUrl = '[https://oemwgwuzxzeiflrphbkn.supabase.co](https://oemwgwuzxzeiflrphbkn.supabase.co)'; 
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9lbXdnd3V6eHplaWZscnBoYmtuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE4MzMwNzcsImV4cCI6MjA4NzQwOTA3N30.Qe9RHx3Nb4_gt5SQfWCAmyzxSjzYokZrwk8zbopc4FQ'; 

let supabase;
try {
    if(supabaseUrl.startsWith('YOUR')) throw new Error("Missing config");
    supabase = createClient(supabaseUrl, supabaseKey);
} catch(e) {
    console.warn("Supabase not configured. Using mock data mode for UI demo.");
    supabase = null; 
}

// Global State
const state = {
    user: null, isAdmin: false,
    customers: [], sales: [], restocks: [], debtPayments: [], salary: [], others: [],
    cacheWAC: { "14":0, "12":0, "ind":0 }
};

// ---------------------------------------------------------
// UTILITIES
// ---------------------------------------------------------
const q = (sel) => document.querySelector(sel);
const formatRM = (val) => Number(val || 0).toFixed(2);
const todayStr = () => new Date().toISOString().split('T')[0];

window.app = {
    showToast(msg, type='success') {
        const toast = document.createElement('div');
        toast.className = `toast px-4 py-3 rounded shadow-lg text-white font-medium text-sm flex items-center gap-2 ${type==='error'?'bg-red-600':'bg-green-600'}`;
        toast.innerHTML = `<i data-lucide="${type==='error'?'alert-circle':'check-circle'}"></i> ${msg}`;
        q('#toast-container').appendChild(toast);
        lucide.createIcons({root: toast});
        setTimeout(() => {
            toast.classList.add('hide');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    },
    showModal(id) { q('#'+id).classList.remove('hidden'); },
    hideModal(id) { q('#'+id).classList.add('hidden'); },
    toggleCollapse(id) { q('#'+id).classList.toggle('hidden'); },
    
    // Routing
    navigate() {
        const hash = window.location.hash || '#/sales';
        document.querySelectorAll('.view-section').forEach(el => el.classList.add('hidden'));
        document.querySelectorAll('.nav-link').forEach(el => {
            el.classList.remove('bg-slate-800', 'text-white', 'text-blue-600');
            if(el.dataset.target === hash.replace('#/', '')) {
                if(window.innerWidth >= 768) el.classList.add('bg-slate-800', 'text-white');
                else el.classList.add('text-blue-600');
            }
        });

        if (hash === '#/admin') {
            q('#view-admin').classList.remove('hidden');
            if(state.isAdmin) {
                q('#admin-login').classList.add('hidden');
                q('#admin-content').classList.remove('hidden');
                app.switchAdminTab('customers');
                app.loadAdminData();
            } else {
                q('#admin-login').classList.remove('hidden');
                q('#admin-content').classList.add('hidden');
            }
        } else {
            const viewId = 'view-' + hash.replace('#/', '');
            if(q('#'+viewId)) q('#'+viewId).classList.remove('hidden');
        }
    },
    switchAdminTab(tab) {
        document.querySelectorAll('.adm-tab-content').forEach(el => el.classList.add('hidden'));
        document.querySelectorAll('.adm-tab-btn').forEach(el => {
            el.classList.remove('bg-slate-800', 'text-white');
            el.classList.add('bg-slate-200', 'text-slate-700');
            if(el.dataset.tab === tab) {
                el.classList.remove('bg-slate-200', 'text-slate-700');
                el.classList.add('bg-slate-800', 'text-white');
            }
        });
        q('#adm-'+tab).classList.remove('hidden');
    },

    // Authentication
    async checkAuth() {
        if(!supabase) return;
        const { data: { session } } = await supabase.auth.getSession();
        if(session) {
            state.user = session.user;
            state.isAdmin = true;
            q('#desktop-user-info').classList.remove('hidden');
        }
    },
    async handleLogin(e) {
        e.preventDefault();
        const btn = q('#btn-login'); btn.innerText = "Sila tunggu...";
        const email = q('#login-email').value;
        const password = q('#login-pwd').value;
        
        if(!supabase) { 
            app.showToast("Ciri ini perlukan sambungan Supabase", "error"); 
            btn.innerText = "Log Masuk"; 
            return; 
        }
        
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        
        if(error && email === 'admin@gmail.com' && password === 'Tanjung1234') { 
            app.showToast("Sistem log masuk Supabase sibuk. Mod Pintasan diaktifkan.", "success"); 
            state.isAdmin = true;
            state.user = { email: email };
            q('#desktop-user-info').classList.remove('hidden');
            app.navigate();
            app.loadAdminData();
            btn.innerText = "Log Masuk";
            return;
        } else if (error) {
            app.showToast("Ralat Log Masuk: " + error.message, "error"); 
            btn.innerText = "Log Masuk"; 
            return; 
        }
        
        await app.checkAuth();
        app.showToast("Berjaya Log Masuk Admin", "success");
        app.navigate();
        app.loadAdminData();
        btn.innerText = "Log Masuk";
    },
    async logout() {
        if(supabase) await supabase.auth.signOut();
        state.user = null; state.isAdmin = false;
        q('#desktop-user-info').classList.add('hidden');
        window.location.hash = '#/sales';
        app.showToast("Telah log keluar");
    },

    // Data Fetching & Sync
    async initData() {
        q('#f_sale_date').value = todayStr();
        q('#r_date').value = todayStr();
        q('#s_date').value = todayStr();
        q('#m_date').value = todayStr();
        
        if(!supabase) { app.mockData(); app.renderAll(); return; }

        try {
            const [cRes, sRes, rRes, dpRes] = await Promise.all([
                supabase.from('customers').select('*').order('name'),
                supabase.from('sales').select('*, customers(name)').order('date', {ascending: false}),
                supabase.from('restocks').select('*').order('date', {ascending: false}),
                supabase.from('debt_payments').select('*, customers(name)').order('date', {ascending: false})
            ]);
            
            if (cRes.error) console.error("Ralat Pelanggan:", cRes.error.message);
            if (sRes.error) console.error("Ralat Jualan:", sRes.error.message);
            
            state.customers = cRes.data || [];
            state.sales = sRes.data || [];
            state.restocks = rRes.data || [];
            state.debtPayments = dpRes.data || [];

            app.renderAll();
        } catch(err) {
            console.error("Ralat Keseluruhan Data:", err);
            app.showToast("Ralat menyemak pangkalan data. Sila semak jadual SQL.", "error");
        }
    },
    async loadAdminData() {
        if(!supabase) return;
        const [salRes, othRes] = await Promise.all([
            supabase.from('staff_salary').select('*').order('date', {ascending: false}),
            supabase.from('capital_others').select('*').order('date', {ascending: false})
        ]);
        
        if(salRes.error) console.error("Ralat Gaji:", salRes.error.message);
        
        state.salary = salRes.data || [];
        state.others = othRes.data || [];
        app.renderAdminTables();
    },

    // Renders
    renderAll() {
        app.updateMonitoring();
        app.renderSales();
        app.renderRestocks();
        app.renderHutang();
        
        const custOpts = '<option value="">-- Pilih Pelanggan --</option>' + state.customers.map(c => `<option value="${c.id}">${c.name} (${c.category})</option>`).join('');
        if(q('#f_sale_cust')) q('#f_sale_cust').innerHTML = custOpts;
        lucide.createIcons();
    },
    updateMonitoring() {
        let stock14=0, stock12=0, stockInd=0;
        let sold14=0, sold12=0, soldInd=0;
        const today = todayStr();

        state.restocks.forEach(r => {
            stock14 += Number(r.qty_14kg);
            stock12 += Number(r.qty_12kg);
            stockInd += Number(r.qty_industri);
        });

        state.sales.forEach(s => {
            const s14 = Number(s.qty_14kg), s12 = Number(s.qty_12kg), si = Number(s.qty_industri);
            stock14 -= s14; stock12 -= s12; stockInd -= si;
            
            if(s.date === today) {
                sold14 += s14; sold12 += s12; soldInd += si;
            }
        });

        q('#stk-14').innerText = stock14; q('#stk-12').innerText = stock12; q('#stk-ind').innerText = stockInd;
        q('#t-sold-14').innerText = sold14; q('#t-sold-12').innerText = sold12; q('#t-sold-ind').innerText = soldInd;
    },
    renderSales() {
        const tbody = q('#tbl-sales');
        if(!tbody) return;
        tbody.innerHTML = state.sales.slice(0, 50).map(s => {
            const total = (s.qty_14kg*s.paid_price_14kg) + (s.qty_12kg*s.paid_price_12kg) + (s.qty_industri*s.paid_price_industri);
            const qtyStr = `14kg:${s.qty_14kg} | 12kg:${s.qty_12kg} | Ind:${s.qty_industri}`;
            return `<tr>
                <td class="p-3 border-b text-xs">${s.date}<br><span class="text-slate-400 font-mono">${s.receipt_no || ''}</span></td>
                <td class="p-3 border-b">${s.customers?.name || 'Unknown'}</td>
                <td class="p-3 border-b text-xs">${qtyStr}</td>
                <td class="p-3 border-b font-bold text-slate-800">${formatRM(total)}</td>
                <td class="p-3 border-b">${s.is_credit ? '<span class="bg-red-100 text-red-700 px-2 py-1 rounded text-xs">HUTANG</span>' : '<span class="bg-green-100 text-green-700 px-2 py-1 rounded text-xs">LUNAS</span>'}</td>
                <td class="p-3 border-b text-right">
                    <button onclick="app.printSaleReceipt('${s.id}')" class="text-blue-500 hover:text-blue-700"><i data-lucide="printer" class="w-4 h-4"></i></button>
                </td>
            </tr>`;
        }).join('');
    },
    renderRestocks() {
        const tbody = q('#tbl-restocks');
        if(!tbody) return;
        tbody.innerHTML = state.restocks.slice(0, 50).map(r => `<tr>
            <td class="p-3 border-b">${r.date}</td>
            <td class="p-3 border-b">${r.qty_14kg} / ${r.qty_12kg} / ${r.qty_industri}</td>
            <td class="p-3 border-b text-xs">RM${r.cost_14kg_per_tong} / RM${r.cost_12kg_per_tong} / RM${r.cost_industri_per_tong}</td>
            <td class="p-3 border-b text-xs">${r.note || '-'}</td>
            <td class="p-3 border-b text-right">
                <button onclick="app.deleteRecord('restocks', '${r.id}')" class="text-red-500 hover:text-red-700"><i data-lucide="trash" class="w-4 h-4"></i></button>
            </td>
        </tr>`).join('');
    },
    renderHutang() {
        const outMap = {};
        state.customers.forEach(c => { outMap[c.id] = {id: c.id, name: c.name, b14:0, b12:0, bind:0}; });
        
        state.sales.forEach(s => {
            if(s.is_credit && outMap[s.customer_id]) {
                outMap[s.customer_id].b14 += (s.qty_14kg * s.paid_price_14kg);
                outMap[s.customer_id].b12 += (s.qty_12kg * s.paid_price_12kg);
                outMap[s.customer_id].bind += (s.qty_industri * s.paid_price_industri);
            }
        });
        state.debtPayments.forEach(p => {
            if(outMap[p.customer_id]) {
                outMap[p.customer_id].b14 -= p.amount_14kg;
                outMap[p.customer_id].b12 -= p.amount_12kg;
                outMap[p.customer_id].bind -= p.amount_industri;
            }
        });

        const list = q('#list-penghutang');
        list.innerHTML = '';
        let hasHutang = false;
        Object.values(outMap).forEach(o => {
            const total = o.b14 + o.b12 + o.bind;
            if(total > 0.01) {
                hasHutang = true;
                list.innerHTML += `<div class="border p-3 rounded hover:bg-slate-50 flex justify-between items-center">
                    <div>
                        <p class="font-bold text-slate-800">${o.name}</p>
                        <p class="text-xs text-slate-500">Jumlah Baki: RM ${formatRM(total)}</p>
                    </div>
                    <button onclick="app.showBayarPanel('${o.id}', ${o.b14}, ${o.b12}, ${o.bind})" class="bg-green-500 text-white px-3 py-1 text-sm rounded hover:bg-green-600">Bayar</button>
                </div>`;
            }
        });
        if(!hasHutang) list.innerHTML = `<p class="text-sm text-slate-500">Tiada pelanggan berhutang setakat ini.</p>`;
    },
    renderAdminTables() {
        q('#tbl-customers').innerHTML = state.customers.map(c => `<tr>
            <td class="p-2">${c.name}</td><td class="p-2">${c.category}</td>
            <td class="p-2">RM${formatRM(c.price_14kg)}</td><td class="p-2">RM${formatRM(c.price_12kg)}</td><td class="p-2">RM${formatRM(c.price_industri)}</td>
            <td class="p-2 text-right"><button onclick="app.deleteRecord('customers', '${c.id}')" class="text-red-500"><i data-lucide="trash" class="w-4 h-4"></i></button></td>
        </tr>`).join('');
        
        q('#tbl-ledger').innerHTML = state.debtPayments.map(p => {
            const t = p.amount_14kg + p.amount_12kg + p.amount_industri;
            return `<tr>
                <td class="p-2">${p.date}<br><span class="text-xs text-slate-400">${p.receipt_no||''}</span></td><td class="p-2">${p.customers?.name}</td>
                <td class="p-2 font-bold text-green-600">RM${formatRM(t)}</td><td class="p-2">${p.payment_type}</td>
                <td class="p-2 text-right"><button onclick="app.printPaymentReceipt('${p.id}')" class="text-blue-500"><i data-lucide="printer" class="w-4 h-4"></i></button></td>
            </tr>`;
        }).join('');

        q('#tbl-salary').innerHTML = state.salary.map(s => `<tr>
            <td class="p-2">${s.date}</td><td class="p-2">${s.staff_name}</td><td class="p-2">RM${formatRM(s.salary_amount)}</td><td class="p-2">${s.note||'-'}</td>
            <td class="p-2 text-right"><button onclick="app.deleteRecord('staff_salary', '${s.id}')" class="text-red-500"><i data-lucide="trash" class="w-4 h-4"></i></button></td>
        </tr>`).join('');
        lucide.createIcons();
    },

    // Business Logic Methods
    autofillPrices() {
        const cid = q('#f_sale_cust').value;
        const cust = state.customers.find(c => c.id === cid);
        if(cust) {
            q('#f_sale_prc14').value = cust.price_14kg;
            q('#f_sale_prc12').value = cust.price_12kg;
            q('#f_sale_prcind').value = cust.price_industri;
        }
    },
    calculateWAC(date) {
        let c14=0, q14=0, c12=0, q12=0, ci=0, qi=0;
        const pastRestocks = state.restocks.filter(r => r.date <= date);
        pastRestocks.forEach(r => {
            q14 += r.qty_14kg; c14 += (r.qty_14kg * r.cost_14kg_per_tong);
            q12 += r.qty_12kg; c12 += (r.qty_12kg * r.cost_12kg_per_tong);
            qi += r.qty_industri; ci += (r.qty_industri * r.cost_industri_per_tong);
        });
        return {
            w14: q14 ? (c14/q14) : 0,
            w12: q12 ? (c12/q12) : 0,
            wi: qi ? (ci/qi) : 0
        };
    },

    // Form Submissions
    async saveSale(e) {
        e.preventDefault();
        const btn = q('#btn-save-sale'); btn.disabled = true; btn.innerText = "Menyimpan...";
        
        const payload = {
            date: q('#f_sale_date').value,
            customer_id: q('#f_sale_cust').value,
            qty_14kg: Number(q('#f_sale_qty14').value||0), paid_price_14kg: Number(q('#f_sale_prc14').value||0),
            qty_12kg: Number(q('#f_sale_qty12').value||0), paid_price_12kg: Number(q('#f_sale_prc12').value||0),
            qty_industri: Number(q('#f_sale_qtyind').value||0), paid_price_industri: Number(q('#f_sale_prcind').value||0),
            payment_type: q('#f_sale_ptype').value,
            is_credit: q('#f_sale_credit').checked,
            note: q('#f_sale_note').value
        };

        const wac = app.calculateWAC(payload.date);
        payload.cost_snapshot_14kg = wac.w14;
        payload.cost_snapshot_12kg = wac.w12;
        payload.cost_snapshot_industri = wac.wi;

        if(!payload.customer_id) { app.showToast("Pilih Pelanggan", "error"); btn.disabled=false; return; }

        if(supabase) {
            const { data, error } = await supabase.from('sales').insert([payload]).select('*, customers(name)').single();
            if(error) { app.showToast(error.message, "error"); btn.disabled=false; return; }
            state.sales.unshift(data);
            app.printSaleReceiptFromData(data);
        } else {
            payload.id = 'MOCK-'+Date.now(); payload.receipt_no = 'GT-MOCK-001'; 
            payload.customers = state.customers.find(c=>c.id===payload.customer_id);
            state.sales.unshift(payload);
            app.printSaleReceiptFromData(payload);
        }

        app.showToast("Jualan Direkod");
        app.hideModal('modal-sale');
        e.target.reset();
        q('#f_sale_date').value = todayStr();
        app.renderAll();
        btn.disabled = false; btn.innerText = "Simpan & Resit";
    },
    async saveRestock(e) {
        e.preventDefault();
        const payload = {
            date: q('#r_date').value,
            qty_14kg: Number(q('#r_q14').value||0), cost_14kg_per_tong: Number(q('#r_c14').value||0),
            qty_12kg: Number(q('#r_q12').value||0), cost_12kg_per_tong: Number(q('#r_c12').value||0),
            qty_industri: Number(q('#r_qi').value||0), cost_industri_per_tong: Number(q('#r_ci').value||0),
            note: q('#r_note').value
        };
        if(supabase) {
            const { data, error } = await supabase.from('restocks').insert([payload]).select().single();
            if(error) { app.showToast(error.message, "error"); return; }
            state.restocks.unshift(data);
        } else { payload.id='MOCKR-'+Date.now(); state.restocks.unshift(payload); }
        app.showToast("Restock Direkod"); app.hideModal('modal-restock'); e.target.reset(); q('#r_date').value = todayStr(); app.renderAll();
    },
    async saveCustomer(e) {
        e.preventDefault();
        const payload = {
            name: q('#c_name').value,
            category: q('#c_cat').value,
            price_14kg: Number(q('#c_p14').value||0),
            price_12kg: Number(q('#c_p12').value||0),
            price_industri: Number(q('#c_pind').value||0)
        };
        if(supabase) {
            const { data, error } = await supabase.from('customers').insert([payload]).select().single();
            if(error) { app.showToast(error.message, "error"); return; }
            state.customers.push(data);
            state.customers.sort((a,b) => a.name.localeCompare(b.name));
        } else {
            payload.id = 'MOCKC-'+Date.now();
            state.customers.push(payload);
        }
        app.showToast("Pelanggan Ditambah"); app.hideModal('modal-customer'); e.target.reset(); 
        app.renderAll(); if(state.isAdmin) app.renderAdminTables();
    },
    async saveSalary(e) {
        e.preventDefault();
        const payload = {
            date: q('#s_date').value,
            staff_name: q('#s_name').value,
            salary_amount: Number(q('#s_amt').value||0),
            note: q('#s_note').value
        };
        if(supabase) {
            const { data, error } = await supabase.from('staff_salary').insert([payload]).select().single();
            if(error) { app.showToast(error.message, "error"); return; }
            state.salary.unshift(data);
        } else {
            payload.id = 'MOCKS-'+Date.now();
            state.salary.unshift(payload);
        }
        app.showToast("Gaji Direkod"); app.hideModal('modal-salary'); e.target.reset(); q('#s_date').value = todayStr();
        if(state.isAdmin) app.renderAdminTables();
    },
    async saveModalLain(e) {
        e.preventDefault();
        const payload = {
            date: q('#m_date').value,
            type_modal: q('#m_type').value,
            amount: Number(q('#m_amt').value||0),
            note: q('#m_note').value
        };
        if(supabase) {
            const { data, error } = await supabase.from('capital_others').insert([payload]).select().single();
            if(error) { app.showToast(error.message, "error"); return; }
            state.others.unshift(data);
        } else {
            payload.id = 'MOCKM-'+Date.now();
            state.others.unshift(payload);
        }
        app.showToast("Modal Lain Direkod"); app.hideModal('modal-modal'); e.target.reset(); q('#m_date').value = todayStr();
    },

    // Hutang Handlers
    showBayarPanel(cid, b14, b12, bind) {
        const cust = state.customers.find(c => c.id === cid);
        q('#bayar-hutang-title').innerText = `Bayar: ${cust.name}`;
        q('#bh_customer_id').value = cid;
        q('#bh_baki_14').innerText = formatRM(b14);
        q('#bh_baki_12').innerText = formatRM(b12);
        q('#bh_baki_ind').innerText = formatRM(bind);
        
        q('#bh_amt_14').value = ''; q('#bh_amt_12').value = ''; q('#bh_amt_ind').value = '';
        q('#panel-bayar-hutang').classList.remove('hidden');
        q('#panel-bayar-hutang').scrollIntoView({behavior: 'smooth'});
    },
    hideBayarPanel() { q('#panel-bayar-hutang').classList.add('hidden'); },
    async handleBayarHutang(e) {
        e.preventDefault();
        const payload = {
            date: todayStr(),
            customer_id: q('#bh_customer_id').value,
            amount_14kg: Number(q('#bh_amt_14').value||0),
            amount_12kg: Number(q('#bh_amt_12').value||0),
            amount_industri: Number(q('#bh_amt_ind').value||0),
            payment_type: q('#bh_payment_type').value,
            note: q('#bh_note').value
        };
        if(payload.amount_14kg===0 && payload.amount_12kg===0 && payload.amount_industri===0) {
            app.showToast("Sila masukkan jumlah bayaran", "error"); return;
        }
        
        if(supabase) {
            const { data, error } = await supabase.from('debt_payments').insert([payload]).select('*, customers(name)').single();
            if(error) { app.showToast(error.message, "error"); return; }
            state.debtPayments.unshift(data);
            app.printPaymentReceiptFromData(data);
        } else {
            payload.id='MOCKP-'+Date.now(); payload.receipt_no='GT-PAY-001';
            payload.customers = state.customers.find(c=>c.id===payload.customer_id);
            state.debtPayments.unshift(payload);
            app.printPaymentReceiptFromData(payload);
        }
        
        app.showToast("Bayaran Diterima"); app.hideBayarPanel(); app.renderAll(); if(state.isAdmin) app.loadAdminData();
    },

    // Deletion logic (Admin mostly)
    async deleteRecord(table, id) {
        if(!confirm("Pasti mahu padam rekod ini?")) return;
        if(supabase) {
            const { error } = await supabase.from(table).delete().eq('id', id);
            if(error) { app.showToast(error.message, "error"); return; }
        }
        if(table==='sales') state.sales = state.sales.filter(x=>x.id!==id);
        if(table==='restocks') state.restocks = state.restocks.filter(x=>x.id!==id);
        if(table==='customers') state.customers = state.customers.filter(x=>x.id!==id);
        if(table==='staff_salary') state.salary = state.salary.filter(x=>x.id!==id);
        app.showToast("Rekod dipadam");
        app.renderAll(); if(state.isAdmin) app.renderAdminTables();
    },

    // Printing
    printSaleReceipt(id) {
        const s = state.sales.find(x => x.id === id);
        if(s) app.printSaleReceiptFromData(s);
    },
    printSaleReceiptFromData(s) {
        const total = (s.qty_14kg*s.paid_price_14kg) + (s.qty_12kg*s.paid_price_12kg) + (s.qty_industri*s.paid_price_industri);
        let itemsHtml = '';
        if(s.qty_14kg > 0) itemsHtml += `<tr><td class="py-1">Gas 14kg</td><td class="text-center">${s.qty_14kg}</td><td class="text-right">RM${formatRM(s.paid_price_14kg)}</td><td class="text-right">RM${formatRM(s.qty_14kg*s.paid_price_14kg)}</td></tr>`;
        if(s.qty_12kg > 0) itemsHtml += `<tr><td class="py-1">Gas 12kg</td><td class="text-center">${s.qty_12kg}</td><td class="text-right">RM${formatRM(s.paid_price_12kg)}</td><td class="text-right">RM${formatRM(s.qty_12kg*s.paid_price_12kg)}</td></tr>`;
        if(s.qty_industri > 0) itemsHtml += `<tr><td class="py-1">Gas Industri</td><td class="text-center">${s.qty_industri}</td><td class="text-right">RM${formatRM(s.paid_price_industri)}</td><td class="text-right">RM${formatRM(s.qty_industri*s.paid_price_industri)}</td></tr>`;

        const html = `
            <div style="font-family: monospace; max-width: 300px; margin: 0 auto; text-align: center;">
                <h2 style="font-size:18px; font-weight:bold; margin-bottom: 2px;">GAS TANJUNG HQ</h2>
                <p style="font-size:12px; margin-top:0;">Resit Rasmi</p>
                <div style="text-align:left; font-size:12px; border-bottom:1px dashed #000; padding-bottom:10px; margin-bottom:10px;">
                    <p>No: ${s.receipt_no}</p>
                    <p>Tarikh: ${s.date}</p>
                    <p>Pelanggan: ${s.customers?.name}</p>
                </div>
                <table style="width:100%; font-size:12px; text-align:left; border-collapse: collapse;">
                    <thead><tr style="border-bottom:1px dashed #000;"><th class="pb-1">Item</th><th class="text-center">Qty</th><th class="text-right">Hrga</th><th class="text-right">Jum</th></tr></thead>
                    <tbody>${itemsHtml}</tbody>
                </table>
                <div style="text-align:right; font-size:14px; font-weight:bold; border-top:1px dashed #000; padding-top:10px; margin-top:10px;">
                    Jumlah: RM ${formatRM(total)}
                </div>
                <div style="text-align:left; font-size:12px; margin-top:10px;">
                    <p>Cara: ${s.payment_type}</p>
                    ${s.is_credit ? '<p style="font-weight:bold; font-size:14px;">STATUS: HUTANG</p>' : '<p>STATUS: LUNAS</p>'}
                    <p>Nota: ${s.note||'-'}</p>
                </div>
                <p style="font-size:10px; margin-top:20px; text-align:center;">Terima Kasih!</p>
            </div>`;
        q('#print-area').innerHTML = html;
        window.print();
    },
    printPaymentReceiptFromData(p) {
        const total = p.amount_14kg + p.amount_12kg + p.amount_industri;
        const html = `
            <div style="font-family: monospace; max-width: 300px; margin: 0 auto; text-align: center;">
                <h2 style="font-size:18px; font-weight:bold; margin-bottom: 2px;">GAS TANJUNG HQ</h2>
                <p style="font-size:12px; margin-top:0;">Resit Bayaran Hutang</p>
                <div style="text-align:left; font-size:12px; border-bottom:1px dashed #000; padding-bottom:10px; margin-bottom:10px;">
                    <p>No: ${p.receipt_no}</p>
                    <p>Tarikh: ${p.date}</p>
                    <p>Pelanggan: ${p.customers?.name}</p>
                </div>
                <div style="text-align:left; font-size:12px;">
                    <p>Bayaran 14kg: RM ${formatRM(p.amount_14kg)}</p>
                    <p>Bayaran 12kg: RM ${formatRM(p.amount_12kg)}</p>
                    <p>Bayaran Ind: RM ${formatRM(p.amount_industri)}</p>
                </div>
                <div style="text-align:right; font-size:14px; font-weight:bold; border-top:1px dashed #000; padding-top:10px; margin-top:10px;">
                    Jumlah Bayaran: RM ${formatRM(total)}
                </div>
                <p style="font-size:10px; margin-top:20px; text-align:center;">Terima Kasih!</p>
            </div>`;
        q('#print-area').innerHTML = html;
        window.print();
    },

    // NEW REPORTS LOGIC
    generateReport() {
        const start = q('#rep-start').value || '2000-01-01';
        const end = q('#rep-end').value || '2099-12-31';
        
        let modalGas = 0, modalLain = 0, modalGaji = 0;
        let jualanKasar = 0, kosBarangDijual = 0;
        let hutangKasar = 0, bayaranHutang = 0;
        
        // 1. Kira semua bahagian Modal
        state.restocks.forEach(r => {
            if(r.date >= start && r.date <= end) {
                modalGas += (r.qty_14kg*r.cost_14kg_per_tong) + (r.qty_12kg*r.cost_12kg_per_tong) + (r.qty_industri*r.cost_industri_per_tong);
            }
        });
        state.others.forEach(o => { 
            if(o.date >= start && o.date <= end) modalLain += Number(o.amount); 
        });
        state.salary.forEach(s => { 
            if(s.date >= start && s.date <= end) modalGaji += Number(s.salary_amount); 
        });

        // 2. Kira Untung & Hutang dari Rekod Jualan
        state.sales.forEach(s => {
            if(s.date >= start && s.date <= end) {
                // Jumlah jualan kotor
                const gross = (s.qty_14kg*s.paid_price_14kg) + (s.qty_12kg*s.paid_price_12kg) + (s.qty_industri*s.paid_price_industri);
                // Kos modal barang yang dijual (COGS)
                const cogs = (s.qty_14kg*s.cost_snapshot_14kg) + (s.qty_12kg*s.cost_snapshot_12kg) + (s.qty_industri*s.cost_snapshot_industri);
                
                jualanKasar += gross;
                kosBarangDijual += cogs;

                if(s.is_credit) {
                    hutangKasar += gross; // Tambah kepada Hutang Kasar tempoh ini
                }
            }
        });
        
        // 3. Kira bayaran hutang yang diterima
        state.debtPayments.forEach(p => {
            if(p.date >= start && p.date <= end) {
                bayaranHutang += (p.amount_14kg + p.amount_12kg + p.amount_industri);
            }
        });

        // --- PENGIRAAN AKHIR ---
        const untungKasar = jualanKasar - kosBarangDijual;
        const untungBersih = untungKasar - modalLain - modalGaji;
        
        const hutangBersih = Math.max(0, hutangKasar - bayaranHutang);

        // --- PAPARKAN KE UI ---
        q('#rep-modal-gas').innerText = `RM ${formatRM(modalGas)}`;
        q('#rep-modal-lain').innerText = `RM ${formatRM(modalLain)}`;
        q('#rep-modal-gaji').innerText = `RM ${formatRM(modalGaji)}`;
        
        q('#rep-untung-kasar').innerText = `RM ${formatRM(untungKasar)}`;
        q('#rep-untung-bersih').innerText = `RM ${formatRM(untungBersih)}`;
        
        q('#rep-hutang-kasar').innerText = `RM ${formatRM(hutangKasar)}`;
        q('#rep-hutang-bersih').innerText = `RM ${formatRM(hutangBersih)}`;

        q('#report-results').classList.remove('hidden');
        
        // Simpan format CSV untuk Eksport
        state.currentReportStr = `Laporan Prestasi Gas Tanjung\nTarikh: ${start} hingga ${end}\nModal Gas: RM${formatRM(modalGas)}\nModal Lain-lain: RM${formatRM(modalLain)}\nModal Gaji: RM${formatRM(modalGaji)}\nUntung Kasar: RM${formatRM(untungKasar)}\nUntung Bersih: RM${formatRM(untungBersih)}\nHutang Kasar: RM${formatRM(hutangKasar)}\nHutang Bersih: RM${formatRM(hutangBersih)}`;
    },
    
    exportCSV() {
        if(!state.currentReportStr) return app.showToast("Sila Jana Laporan dahulu", "error");
        const blob = new Blob([state.currentReportStr], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", `Laporan_GasTanjung_${todayStr()}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    },

    mockData() {
        state.customers = [{id:'c1', name:'Ali Runcit', category:'Runcit', price_14kg:28, price_12kg:24, price_industri:150}];
        state.restocks = [{id:'r1', date:todayStr(), qty_14kg:100, cost_14kg_per_tong:22, qty_12kg:50, cost_12kg_per_tong:18, qty_industri:0, cost_industri_per_tong:0}];
        state.sales = [{id:'s1', date:todayStr(), receipt_no:'GT-MOCK', customer_id:'c1', customers:{name:'Ali Runcit'}, qty_14kg:5, paid_price_14kg:28, qty_12kg:0, paid_price_12kg:0, qty_industri:0, paid_price_industri:0, is_credit:true, cost_snapshot_14kg:22, cost_snapshot_12kg:0, cost_snapshot_industri:0}];
        state.debtPayments = [];
        state.salary = [];
        state.others = [];
    }
};

// Initialize Router and Data
window.addEventListener('hashchange', app.navigate);
document.addEventListener('DOMContentLoaded', async () => {
    lucide.createIcons();
    await app.checkAuth();
    app.navigate();
    app.initData();
});