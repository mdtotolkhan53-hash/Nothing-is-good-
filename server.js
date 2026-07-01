const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(cors());
app.use(express.json());

const supabaseUrl = 'https://kbgzexismbfouhaueayv.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtiZ3pleGlzbWJmb3VoYXVlYXl2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI5MTcxOTAsImV4cCI6MjA5ODQ5MzE5MH0.RiyWDCTniDXriq3gCgqSOOiP6YGw0diaPvfg5pP-J9g';
const supabase = createClient(supabaseUrl, supabaseKey);

// ✅ WinGo Data Fetch - Proxy Method
async function fetchWingoData() {
    try {
        console.log('📡 Fetching WinGo data...');
        
        // Multiple methods চেষ্টা
        const methods = [
            async () => {
                // Method 1: Direct with headers
                return await axios.get(
                    'https://draw.ar-lottery01.com/WinGo/WinGo_30S/GetHistoryIssuePage.json',
                    {
                        timeout: 10000,
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                            'Accept': 'application/json, text/plain, */*',
                            'Referer': 'https://www.wingo.com/',
                            'Origin': 'https://www.wingo.com'
                        }
                    }
                );
            },
            async () => {
                // Method 2: AllOrigins Proxy
                const targetUrl = 'https://draw.ar-lottery01.com/WinGo/WinGo_30S/GetHistoryIssuePage.json';
                const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`;
                return await axios.get(proxyUrl, { timeout: 15000 });
            }
        ];
        
        let response = null;
        for (const method of methods) {
            try {
                response = await method();
                if (response && response.status === 200) {
                    console.log('✅ Success with method');
                    break;
                }
            } catch (e) {
                console.log('Method failed, trying next...');
                continue;
            }
        }
        
        if (!response || response.status !== 200) {
            throw new Error('All methods failed');
        }
        
        // ডাটা পার্স করুন
        let data = response.data;
        if (typeof data === 'string') {
            data = JSON.parse(data);
        }
        
        const items = data?.data?.list || [];
        console.log(`✅ Found ${items.length} records`);
        
        return items.map(item => ({
            issue: String(item.issueNumber || item.issue || ''),
            number: String(item.number || '--')
        })).filter(r => r.issue);
        
    } catch (error) {
        console.error('❌ All fetch methods failed:', error.message);
        return [];
    }
}

// API Endpoints (আগের মতো)
app.post('/api/sync', async (req, res) => {
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
        res.json({ success: true, added, total: records.length });
    } catch (error) {
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
            sync: 'POST /api/sync - Sync data from WinGo',
            records: 'GET /api/records - Get all records',
            analysis: 'GET /api/analysis - Get 4,9 analysis'
        }
    });
});

// ⏰ Auto-sync
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
}, 60000); // ১ মিনিটে ১ বার

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`✅ Server running on port ${PORT}`);
});
