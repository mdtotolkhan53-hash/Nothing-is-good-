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

// 🔥 রিয়েল ডাটা ফেচ - মাল্টিপল সোর্স
async function fetchWingoData() {
    const sources = [
        // Source 1: Direct API
        async () => {
            return await axios.get(
                'https://draw.ar-lottery01.com/WinGo/WinGo_30S/GetHistoryIssuePage.json',
                {
                    timeout: 15000,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        'Accept': 'application/json, text/plain, */*',
                        'Accept-Language': 'en-US,en;q=0.9',
                        'Referer': 'https://www.wingo.com/',
                        'Origin': 'https://www.wingo.com',
                        'Cache-Control': 'no-cache'
                    }
                }
            );
        },
        // Source 2: Cors-Anywhere
        async () => {
            const proxyUrl = 'https://cors-anywhere.herokuapp.com/';
            const targetUrl = 'https://draw.ar-lottery01.com/WinGo/WinGo_30S/GetHistoryIssuePage.json';
            return await axios.get(proxyUrl + targetUrl, {
                timeout: 20000,
                headers: {
                    'User-Agent': 'Mozilla/5.0',
                    'Origin': 'https://www.wingo.com'
                }
            });
        },
        // Source 3: AllOrigins
        async () => {
            const targetUrl = 'https://draw.ar-lottery01.com/WinGo/WinGo_30S/GetHistoryIssuePage.json';
            const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`;
            return await axios.get(proxyUrl, { timeout: 15000 });
        },
        // Source 4: Different User-Agent
        async () => {
            return await axios.get(
                'https://draw.ar-lottery01.com/WinGo/WinGo_30S/GetHistoryIssuePage.json',
                {
                    timeout: 15000,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
                        'Accept': 'application/json',
                        'Referer': 'https://www.bet365.com/'
                    }
                }
            );
        }
    ];
    
    for (let i = 0; i < sources.length; i++) {
        try {
            console.log(`📡 Trying source ${i + 1}/${sources.length}...`);
            const response = await sources[i]();
            
            if (response && response.status === 200) {
                let data = response.data;
                if (typeof data === 'string') data = JSON.parse(data);
                
                const items = data?.data?.list || data?.list || [];
                if (items && items.length > 0) {
                    console.log(`✅ Found ${items.length} real records from source ${i + 1}`);
                    const records = items.map(item => ({
                        issue: String(item.issueNumber || item.issue || ''),
                        number: String(item.number || '--')
                    })).filter(r => r.issue && r.issue !== '');
                    
                    if (records.length > 0) {
                        return records;
                    }
                }
            }
        } catch (error) {
            console.log(`❌ Source ${i + 1} failed: ${error.message}`);
        }
    }
    
    console.log('❌ All sources failed');
    return [];
}

// API Endpoints
app.post('/api/sync', async (req, res) => {
    try {
        console.log('🔄 Syncing real data...');
        const records = await fetchWingoData();
        let added = 0;
        
        if (records.length === 0) {
            return res.json({ 
                success: false, 
                message: 'No data fetched from any source',
                records: 0 
            });
        }
        
        for (const record of records) {
            const { error } = await supabase
                .from('wingo_records')
                .upsert({ issue: record.issue, number: record.number }, 
                        { onConflict: 'issue' });
            if (!error) added++;
        }
        
        res.json({ 
            success: true, 
            added, 
            total: records.length,
            message: `${added} real records synced successfully!`
        });
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
        res.json({ 
            small, 
            big, 
            equal, 
            total: numbers.length, 
            verdict, 
            totalPairs: small + big + equal,
            source: 'Real Data'
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/', (req, res) => {
    res.json({ 
        status: '🚀 WinGo Analyzer API is running!',
        endpoints: {
            sync: 'POST /api/sync - Sync real data from WinGo',
            records: 'GET /api/records - Get all records',
            analysis: 'GET /api/analysis - Get 4,9 analysis'
        },
        dataSource: 'Real WinGo API (Multiple Sources)'
    });
});

// ⏰ Auto-sync every 30 seconds
setInterval(async () => {
    try {
        console.log('🔄 Auto-sync: Fetching real data...');
        const records = await fetchWingoData();
        let added = 0;
        for (const record of records) {
            const { error } = await supabase
                .from('wingo_records')
                .upsert({ issue: record.issue, number: record.number }, 
                        { onConflict: 'issue' });
            if (!error) added++;
        }
        if (added > 0) {
            console.log(`✅ Auto-sync: ${added} new real records`);
        }
    } catch (error) {
        console.error('Auto-sync error:', error.message);
    }
}, 30000);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`✅ Server running on port ${PORT}`);
    console.log('📡 Fetching REAL data from WinGo API');
});
