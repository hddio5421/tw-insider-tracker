import fs from 'fs/promises';
import path from 'path';

const TWSE_PLEDGE_URL = 'https://openapi.twse.com.tw/v1/opendata/t187ap11_L';
const TPEX_PLEDGE_URL = 'https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap11_O';
const TWSE_TRANSFER_URL = 'https://openapi.twse.com.tw/v1/opendata/t187ap12_L';
const TPEX_TRANSFER_URL = 'https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap12_O';

async function fetchAndProcessData() {
    console.log('Starting to fetch TWSE & TPEx OpenAPI datasets...');
    try {
        const [twsePledgeRes, tpexPledgeRes, twseTransferRes, tpexTransferRes] = await Promise.all([
            fetch(TWSE_PLEDGE_URL).catch(() => null),
            fetch(TPEX_PLEDGE_URL).catch(() => null),
            fetch(TWSE_TRANSFER_URL).catch(() => null),
            fetch(TPEX_TRANSFER_URL).catch(() => null)
        ]);

        let rawPledgeData = [];
        if (twsePledgeRes?.ok) {
            const d = await twsePledgeRes.json();
            console.log(`Received ${d.length} TWSE Listed Pledge records.`);
            rawPledgeData = rawPledgeData.concat(d);
        }
        if (tpexPledgeRes?.ok) {
            const d = await tpexPledgeRes.json();
            console.log(`Received ${d.length} TPEx OTC Pledge records.`);
            rawPledgeData = rawPledgeData.concat(d);
        }

        let rawTransferData = [];
        if (twseTransferRes?.ok) {
            const d = await twseTransferRes.json();
            if (Array.isArray(d)) rawTransferData = rawTransferData.concat(d.filter(x => x['公司代號']));
        }
        if (tpexTransferRes?.ok) {
            const d = await tpexTransferRes.json();
            if (Array.isArray(d)) rawTransferData = rawTransferData.concat(d.filter(x => x['公司代號']));
        }
        console.log(`Total Insider Transfer notices: ${rawTransferData.length}`);

        const dataDir = path.join(process.cwd(), 'data');
        await fs.mkdir(dataDir, { recursive: true });

        // ── 讀取 90天滾動質押快照 (pledgeSnapshots.json) ─────────────────────
        const pledgeSnapshotsPath = path.join(dataDir, 'pledgeSnapshots.json');
        let pledgeSnapshots = {};
        try {
            pledgeSnapshots = JSON.parse(await fs.readFile(pledgeSnapshotsPath, 'utf-8'));
        } catch (e) {
            console.log('No pledge snapshots found. Will create one.');
        }

        // ── 去除重複並解析本期資料 ────────────────────────────────────────────
        const deduplicatedMap = new Map();
        let currentMonth = '';
        for (const item of rawPledgeData) {
            const id = item['公司代號'];
            const director = (item['姓名'] || '').trim();
            if (!id || !director) continue;

            const uniqueKey = `${id}-${director}`;
            const title = (item['職稱'] || '').trim();
            const pledged = parseInt((item['設質股數'] || '0').replace(/,/g, ''), 10);
            const shares = parseInt((item['目前持股'] || '0').replace(/,/g, ''), 10);
            const ratio = parseFloat((item['設質股數佔持股比例'] || '0.00%').replace('%', ''));

            let dateStr = item['資料年月'] || '';
            if (dateStr.length >= 4) {
                const twYear = parseInt(dateStr.substring(0, dateStr.length - 2), 10);
                const month = dateStr.substring(dateStr.length - 2);
                dateStr = `${twYear + 1911}-${month}`;
                if (!currentMonth) currentMonth = dateStr;
            }

            if (!deduplicatedMap.has(uniqueKey)) {
                deduplicatedMap.set(uniqueKey, {
                    id, name: (item['公司名稱'] || '').trim(), director,
                    titles: new Set([title]), shares, pledged, ratio, date: dateStr
                });
            } else {
                const e = deduplicatedMap.get(uniqueKey);
                if (title) e.titles.add(title);
                e.pledged = Math.max(e.pledged, pledged);
                e.shares  = Math.max(e.shares, shares);
                e.ratio   = Math.max(e.ratio, ratio);
            }
        }

        // ── 儲存今日快照並清理超過 90 天的舊快照 ─────────────────────────────
        // 台灣時區今日日期 (YYYY-MM-DD)
        const todayStr = new Date(Date.now() + 8 * 3600 * 1000).toISOString().split('T')[0];
        const newSnapshot = {};
        for (const [key, item] of deduplicatedMap.entries()) {
            newSnapshot[key] = { pledged: item.pledged, ratio: item.ratio };
        }
        pledgeSnapshots[todayStr] = newSnapshot;

        const ninetyDaysMs = 90 * 24 * 60 * 60 * 1000;
        const nowMs = Date.now() + 8 * 3600 * 1000;
        let oldestDate = todayStr;
        let oldestTimestamp = nowMs;

        for (const d of Object.keys(pledgeSnapshots)) {
            const ts = new Date(d).getTime(); // d is YYYY-MM-DD
            if (nowMs - ts > ninetyDaysMs) {
                delete pledgeSnapshots[d];
            } else {
                if (ts < oldestTimestamp) {
                    oldestTimestamp = ts;
                    oldestDate = d;
                }
            }
        }
        
        await fs.writeFile(pledgeSnapshotsPath, JSON.stringify(pledgeSnapshots, null, 2), 'utf-8');
        console.log(`Pledge snapshot baseline date: ${oldestDate} (Today: ${todayStr})`);
        
        const rollingBaseline = pledgeSnapshots[oldestDate] || {};

        // ── 計算 pledgedDiff = 本期 - 滾動基準 ────────────────────────────────
        const pledgeList = [];

        for (const [uniqueKey, item] of deduplicatedMap.entries()) {
            if (item.pledged <= 0) continue; // 只顯示目前仍有質押者

            const basePledged = rollingBaseline[uniqueKey]?.pledged ?? null;
            // null → 基準日無記錄（新增質設），以本期全數為增量
            const pledgedDiff = basePledged === null ? item.pledged : item.pledged - basePledged;

            pledgeList.push({
                id: item.id,
                name: item.name,
                director: item.director,
                title: Array.from(item.titles).filter(Boolean).join(' / '),
                shares: item.shares,
                pledged: item.pledged,
                ratio: item.ratio,
                date: item.date || currentMonth,
                warning: item.ratio > 50,
                pledgedDiff,
                isNew: basePledged === null  // 期間新增質設標記
            });
        }

        // ── 另外算「已完全解質」的人（基準有，本期不見了）────────────────────
        const currentKeys = new Set(deduplicatedMap.keys());
        const fullyReleased = [];
        for (const [key, base] of Object.entries(rollingBaseline)) {
            if (!currentKeys.has(key) && base.pledged > 0) {
                // 本期資料中消失 → 已完全解質
                const [id, ...nameParts] = key.split('-');
                fullyReleased.push({
                    id, name: '', director: nameParts.join('-'),
                    title: '', shares: 0, pledged: 0, ratio: 0,
                    date: currentMonth, warning: false,
                    pledgedDiff: -base.pledged, isNew: false
                });
            }
        }

        // 合併並排序
        pledgeList.push(...fullyReleased);
        pledgeList.sort((a, b) => (parseInt(a.id, 10) || 0) - (parseInt(b.id, 10) || 0));

        // ── 處理申報轉讓歷史累積 ─────────────────────────────────────────────
        const transferHistoryPath = path.join(dataDir, 'transferHistory.json');
        let transferHistoryMap = new Map();
        try {
            const hist = JSON.parse(await fs.readFile(transferHistoryPath, 'utf-8'));
            if (Array.isArray(hist)) {
                hist.forEach(t => transferHistoryMap.set(t.key, t));
            }
        } catch (e) {
            // First time or file not found
        }

        // 解析並合併今天的新資料
        rawTransferData.forEach(item => {
            const id = item['公司代號'] || '';
            const director = item['姓名'] || '';
            const method = item['預定轉讓方式及股數-轉讓方式'] || item['預定轉讓方式'] || '一般交易';
            const publishDate = item['出表日期'] || item['Date'] || '';
            
            // 建立唯一鍵值：代號-姓名-方式-出表日
            const uniqueKey = `transfer-${id}-${director}-${method}-${publishDate}`;
            
            const sharesOwned = parseInt((item['目前持有股數-自有持股'] || item['目前持股自有持股'] || '0').replace(/,/g, ''), 10);
            const sharesTransfer = parseInt((item['預定轉讓總股數-自有持股'] || item['原申報預定轉讓股數自有持股'] || '0').replace(/,/g, ''), 10);
            
            transferHistoryMap.set(uniqueKey, {
                key: uniqueKey,
                id,
                name: item['公司名稱'] || '',
                director,
                title: item['申報人身分'] || item['申請人身分'] || '',
                method,
                recipient: item['受讓人'] || '市場集中交易',
                currentShares: sharesOwned,
                transferShares: sharesTransfer,
                validPeriod: item['有效轉讓期間'] || '',
                publishDate
            });
        });

        // 剔除超過 90 天的舊資料
        const transferNinetyDaysMs = 90 * 24 * 60 * 60 * 1000;
        const now = Date.now();
        const transferList = [];
        
        for (const [key, t] of transferHistoryMap.entries()) {
            // 解析民國日期，例如 113/08/05 或 1130805
            let dStr = t.publishDate.replace(/\D/g, '');
            let isOld = false;
            if (dStr.length >= 7) {
                const y = parseInt(dStr.substring(0, dStr.length - 4), 10) + 1911;
                const m = parseInt(dStr.substring(dStr.length - 4, dStr.length - 2), 10) - 1;
                const d = parseInt(dStr.substring(dStr.length - 2), 10);
                const pubDate = new Date(y, m, d).getTime();
                if (now - pubDate > transferNinetyDaysMs) {
                    isOld = true;
                }
            }
            if (!isOld) {
                transferList.push(t);
            }
        }
        
        // 依最新日期及股票代號排序 (新的在上面)
        transferList.sort((a, b) => {
            const dateCompare = b.publishDate.localeCompare(a.publishDate);
            if (dateCompare !== 0) return dateCompare;
            return (parseInt(a.id, 10) || 0) - (parseInt(b.id, 10) || 0);
        });

        // 存回 transferHistory.json
        await fs.writeFile(transferHistoryPath, JSON.stringify(transferList, null, 2), 'utf-8');

        // ── 輸出 data.js ──────────────────────────────────────────────────────
        const jsContent =
            `window.PLEDGE_DATA = ${JSON.stringify(pledgeList, null, 2)};\n` +
            `window.TRANSFER_DATA = ${JSON.stringify(transferList, null, 2)};\n`;

        await fs.writeFile(path.join(process.cwd(), 'data.js'), jsContent, 'utf-8');

        const changed = pledgeList.filter(x => x.pledgedDiff !== 0).length;
        console.log(`Saved ${pledgeList.length} active pledges (${changed} with rolling 90-day changes), ${transferList.length} transfer notices.`);
        console.log(`Current data month: ${currentMonth}`);
        console.log('Data written to data.js');

    } catch (error) {
        console.error('Error fetching data:', error);
    }
}

fetchAndProcessData();
