const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(cors());
app.use(express.json());

// Supabase সংযোগ
const supabaseUrl = 'https://kbgzexismbfouhaueayv.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtiZ3pleGlzbWJmb3VoYXVlYXl2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI5MTcxOTAsImV4cCI6MjA5ODQ5MzE5MH0.RiyWDCTniDXriq3gCgqSOOiP6YGw0diaPvfg5pP-J9g';
const supabase = createClient(supabaseUrl, supabaseKey);

// ✅ WinGo থেকে ডাটা আনা (Headers সহ)
async function fetchWingoData() {
    try {
        console.log('📡 Fetching from WinGo API...');
        const response = await axios.get(
            'https://draw.ar-lottery01.com/WinGo/WinGo_30S/GetHistoryIssuePage.json',
            {
                timeout: 15000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'application/json, text/plain, */*',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Referer': 'https://www.google.com/',
                    'Origin': 'https://draw.ar-lottery01.com'
                }
            }
        );
        console.log('✅ WinGo API response received');
        const items = response.data?.data?.list || [];
        console.log(`📊 Found ${items.length} records`);
        return items.map(item => ({
            issue: String(item.issueNumber || item.issue || ''),
            number: String(item.number || '--')
        })).filter(r => r.issue);
    } catch (error) {
        console.error('❌ Fetch error:', error.message);
        if (error.response) {
            console.error('Status:', error.response.status);
        }
        return [];
    }
}

// API Endpoints
app.post('/api/sync', async (req, res) => {
    try {
        console.log('🔄 Syncing data...');
        const records = await fetchWingoData();
        let added = 0;
        for (const record of records) {
            const { error } = await supabase
                .from('wingo_records')
                .upsert({ issue: record.issue, number: record.number }, 
                        { onConflict: 'issue' });
            if (!error) added++;
        }
        console.log(`✅ Synced: ${added} new records`);
        res.json({ success: true, added, total: records.length });
    } catch (error) {
        console.error('Sync error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/records', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('wingo_records')
            .select('issue, number')
            .order('issue', { ascending: false })
            .limit(200);
        if (error) throw error;
        res.json(data || []);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/analysis', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('wingo_records')
            .select('number')
            .order('issue', { ascending: false })
            .limit(200);
        if (error) throw error;
        
        const numbers = [];
        for (const row of data || []) {
            const parts = row.number.split(/[,\s]+/).filter(n => n.trim() !== '');
            for (const p of parts) {
                const num = parseInt(p.trim());
                if (!isNaN(num) && num >= 0 && num <= 9) numbers.push(num);
            }
        }
        
        let small = 0, big = 0, equal = 0;
        for (let i = 0; i < numbers.length - 1; i++) {
            if (numbers[i] === 4 && numbers[i+1] === 9) {
                const prev = i > 0 ? numbers[i-1] : 0;
                if (prev >= 0 && prev <= 4) small++;
                else if (prev >= 5 && prev <= 9) big++;
                else equal++;
            }
        }
        
        const verdict = small > big ? 'small' : big > small ? 'big' : 'equal';
        res.json({ small, big, equal, total: numbers.length, verdict, totalPairs: small + big + equal });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/', (req, res) => {
    res.json({ 
        status: '🚀 WinGo Analyzer API is running!',
        endpoints: {
            sync: 'POST /api/sync',
            records: 'GET /api/records',
            analysis: 'GET /api/analysis'
        }
    });
});

// ⏰ Auto-sync every 30 seconds
setInterval(async () => {
    try {
        const records = await fetchWingoData();
        let added = 0;
        for (const record of records) {
            const { error } = await supabase
                .from('wingo_records')
                .upsert({ issue: record.issue, number: record.number }, 
                        { onConflict: 'issue' });
            if (!error) added++;
        }
        if (added > 0) console.log(`🔄 Auto-sync: ${added} new records`);
    } catch (error) {}
}, 30000);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`✅ Server running on port ${PORT}`);
});
