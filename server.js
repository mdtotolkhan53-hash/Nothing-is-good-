const express = require('express');
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;

// Supabase সংযোগ
const supabaseUrl = process.env.SUPABASE_URL || 'https://kbgzexismbfouhaueayv.supabase.co';
const supabaseKey = process.env.SUPABASE_KEY || 'your-key-here';
const supabase = createClient(supabaseUrl, supabaseKey);

const TABLE = 'wingo_records';
const MAX_RECORDS = 500;

// ======================== WinGo ডাটা ফেচ ========================
async function fetchWingoData() {
    try {
        const res = await axios.get(
            'https://draw.ar-lottery01.com/WinGo/WinGo_30S/GetHistoryIssuePage.json',
            {
                timeout: 15000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Cache-Control': 'no-cache'
                }
            }
        );
        const records = res.data?.data?.list || [];
        return records.map(r => {
            const nums = String(r.number).split(',').map(n => n.trim());
            const last = nums[nums.length - 1] || '0';
            return {
                issue: String(r.issueNumber || ''),
                number: String(last)
            };
        }).filter(r => r.issue);
    } catch (e) {
        console.error('❌ Fetch error:', e.message);
        return [];
    }
}

// ======================== ডাটা সেভ ========================
async function saveRecords(records) {
    let saved = 0;
    for (const rec of records) {
        try {
            const { error } = await supabase
                .from(TABLE)
                .upsert({ issue: rec.issue, number: rec.number }, { onConflict: 'issue' });
            if (!error) saved++;
        } catch (e) { console.error('Save error:', e.message); }
    }
    return saved;
}

// ======================== ক্লিনআপ ========================
async function cleanupOldRecords() {
    try {
        const { data: all } = await supabase
            .from(TABLE)
            .select('issue')
            .order('issue', { ascending: true });
        
        if (all.length > MAX_RECORDS) {
            const toDelete = all.slice(0, all.length - MAX_RECORDS);
            let deleted = 0;
            for (const item of toDelete) {
                const { error } = await supabase
                    .from(TABLE)
                    .delete()
                    .eq('issue', item.issue);
                if (!error) deleted++;
            }
            return deleted;
        }
        return 0;
    } catch (e) { return 0; }
}

// ======================== মিসিং চেক ========================
async function checkAndRepairMissing() {
    try {
        const { data: all } = await supabase
            .from(TABLE)
            .select('issue')
            .order('issue', { ascending: true });
        
        if (all.length < 2) return 0;
        
        const issues = all.map(r => parseInt(r.issue));
        const missing = [];
        for (let i = 1; i < issues.length; i++) {
            const diff = issues[i] - issues[i-1];
            if (diff > 1) {
                for (let j = issues[i-1] + 1; j < issues[i]; j++) {
                    missing.push(j);
                }
            }
        }
        
        if (missing.length === 0) return 0;
        
        // WinGo থেকে মিসিং ডাটা রিকভারি
        const records = await fetchWingoData();
        let recovered = 0;
        for (const issue of missing) {
            const found = records.find(r => parseInt(r.issue) === issue);
            if (found) {
                const { error } = await supabase
                    .from(TABLE)
                    .upsert({ issue: found.issue, number: found.number }, { onConflict: 'issue' });
                if (!error) recovered++;
            }
        }
        return recovered;
    } catch (e) { return 0; }
}

// ======================== মেইন সিঙ্ক ========================
async function syncData() {
    console.log('🔄 সিঙ্ক শুরু:', new Date().toLocaleString('bn-BD', { timeZone: 'Asia/Dhaka' }));
    try {
        const records = await fetchWingoData();
        if (!records.length) {
            console.log('⚠️ কোনো ডাটা পাওয়া যায়নি');
            return;
        }
        
        const saved = await saveRecords(records);
        const deleted = await cleanupOldRecords();
        const repaired = await checkAndRepairMissing();
        
        console.log(`✅ ${saved} টি সেভ হয়েছে, ${deleted} টি ডিলিট, ${repaired} টি রিপেয়ার`);
    } catch (e) {
        console.error('❌ সিঙ্ক ব্যর্থ:', e.message);
    }
}

// ======================== API এন্ডপয়েন্ট ========================
app.get('/', (req, res) => {
    res.json({
        status: '🔄 WinGo Sync Running',
        lastSync: new Date().toLocaleString('bn-BD', { timeZone: 'Asia/Dhaka' })
    });
});

app.post('/sync', async (req, res) => {
    await syncData();
    res.json({ success: true, message: 'সিঙ্ক সম্পূর্ণ!' });
});

// ======================== অটো-সিঙ্ক (প্রতি ৩০ সেকেন্ড) ========================
setInterval(syncData, 30000);

// ======================== সার্ভার চালু ========================
app.listen(PORT, () => {
    console.log(`✅ সার্ভার চলছে: http://localhost:${PORT}`);
    console.log('🔄 অটো-সিঙ্ক চালু (প্রতি ৩০ সেকেন্ডে)');
});
