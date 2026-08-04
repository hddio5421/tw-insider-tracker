import { useState, useEffect, useMemo } from 'react';
import './App.css';

interface PledgeData {
  id: string;
  name: string;
  director: string;
  title: string;
  shares: number;
  pledged: number;
  ratio: number;
  date: string;
  warning?: boolean;
  pledgedDiff?: number;
  lastPledgeDate?: string;
}

interface TransferNotice {
  key: string;
  id: string;
  name: string;
  director: string;
  title: string;
  method: string;
  recipient: string;
  currentShares: number;
  transferShares: number;
  validPeriod: string;
  publishDate: string;
}

type TabType = 'changes' | 'transfer' | 'all';
type SortField = 'id' | 'name' | 'director' | 'pledgedDiff' | 'ratio' | 'pledged' | 'shares' | 'lastPledgeDate' | 'transferShares';
type SortOrder = 'asc' | 'desc';

function App() {
  const [activeTab, setActiveTab] = useState<TabType>('changes');
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [sortField, setSortField] = useState<SortField>('pledgedDiff');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');

  const pledgeRaw: PledgeData[] = (window as any).PLEDGE_DATA || [];
  const transferRaw: TransferNotice[] = (window as any).TRANSFER_DATA || [];

  const [pledgeData, setPledgeData] = useState<PledgeData[]>(pledgeRaw);
  const [transferData, setTransferData] = useState<TransferNotice[]>(transferRaw);

  useEffect(() => {
    if (pledgeData.length === 0 && (window as any).PLEDGE_DATA) setPledgeData((window as any).PLEDGE_DATA);
    if (transferData.length === 0 && (window as any).TRANSFER_DATA) setTransferData((window as any).TRANSFER_DATA);
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, pageSize, sortField, sortOrder, activeTab]);

  // Key derived lists
  const changedPledges = useMemo(() =>
    pledgeData.filter(item => (item.pledgedDiff || 0) !== 0),
    [pledgeData]
  );

  const increasedPledges = changedPledges.filter(item => (item.pledgedDiff || 0) > 0);
  const decreasedPledges = changedPledges.filter(item => (item.pledgedDiff || 0) < 0);
  const highRiskCount = pledgeData.filter(item => item.ratio > 50).length;
  const dataDate = pledgeData.length > 0 ? pledgeData[0].date : '-';

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder(['pledgedDiff', 'ratio', 'pledged', 'transferShares'].includes(field) ? 'desc' : 'asc');
    }
  };

  const activeRawList: any[] = useMemo(() => {
    if (activeTab === 'changes') return changedPledges;
    if (activeTab === 'transfer') return transferData;
    return pledgeData;
  }, [activeTab, changedPledges, transferData, pledgeData]);

  const processedList = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    const filtered = activeRawList.filter((item: any) => {
      if (!term) return true;
      return (
        (item.id?.toLowerCase().includes(term)) ||
        (item.name?.toLowerCase().includes(term)) ||
        (item.director?.toLowerCase().includes(term)) ||
        (item.title?.toLowerCase().includes(term)) ||
        (item.recipient?.toLowerCase().includes(term))
      );
    });

    filtered.sort((a: any, b: any) => {
      if (sortField === 'id') {
        const diff = (parseInt(a.id, 10) || 0) - (parseInt(b.id, 10) || 0);
        return sortOrder === 'asc' ? diff : -diff;
      }
      const valA = a[sortField] ?? '';
      const valB = b[sortField] ?? '';
      if (typeof valA === 'string') {
        return sortOrder === 'asc' ? valA.localeCompare(valB, 'zh-Hant') : valB.localeCompare(valA, 'zh-Hant');
      }
      return sortOrder === 'asc' ? (valA as number) - (valB as number) : (valB as number) - (valA as number);
    });

    return filtered;
  }, [activeRawList, searchTerm, sortField, sortOrder]);

  const totalPages = Math.ceil(processedList.length / pageSize) || 1;
  const startIndex = (currentPage - 1) * pageSize;
  const paginatedData = processedList.slice(startIndex, startIndex + pageSize);

  const exportToCSV = () => {
    if (processedList.length === 0) { alert('無資料可匯出！'); return; }
    let headers: string[] = [];
    let rows: string[][] = [];
    if (activeTab === 'transfer') {
      headers = ['公司代號', '公司名稱', '申報人姓名', '申報人身分', '轉讓方式', '預定轉讓張數', '目前持有張數', '受讓人', '有效轉讓期間'];
      rows = (processedList as TransferNotice[]).map(item => [
        `"${item.id}"`, `"${item.name}"`, `"${item.director}"`, `"${item.title}"`,
        `"${item.method}"`, (item.transferShares / 1000).toFixed(1),
        (item.currentShares / 1000).toFixed(1), `"${item.recipient}"`, `"${item.validPeriod}"`
      ]);
    } else {
      headers = ['公司代號', '公司名稱', '董監姓名', '職稱', '持有張數', '質設張數', '本期異動(張)', '質押比例(%)', '最後質押月份'];
      rows = (processedList as PledgeData[]).map(item => [
        `"${item.id}"`, `"${item.name}"`, `"${item.director}"`, `"${item.title}"`,
        (item.shares / 1000).toFixed(1), (item.pledged / 1000).toFixed(1),
        (item.pledgedDiff || 0) !== 0 ? ((item.pledgedDiff || 0) / 1000).toFixed(1) : '0',
        item.ratio.toFixed(2), `"${item.lastPledgeDate || item.date}"`
      ]);
    }
    const csv = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `台股董監質設_${activeTab}_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const fmt = (n: number) => {
    const s = n / 1000;
    if (s === 0) return '0';
    return Math.abs(s) < 1 ? s.toFixed(1) : s.toLocaleString(undefined, { maximumFractionDigits: 1 });
  };

  const renderSortIcon = (field: SortField) => {
    if (sortField !== field) return <span className="sort-icon inactive">↕</span>;
    return sortOrder === 'asc' ? <span className="sort-icon active">▲</span> : <span className="sort-icon active">▼</span>;
  };

  const isPledgeTab = activeTab === 'changes' || activeTab === 'all';

  return (
    <div className="app-container">
      <header className="app-header glass-card">
        <div className="logo-container">
          <div className="logo-icon"></div>
          <div>
            <h1>台股內部人籌碼風控系統</h1>
            <p className="subtitle">資料期間：{dataDate}｜上市/上櫃董監事持股質押暨申報轉讓即時追蹤</p>
          </div>
        </div>
        <div className="search-container">
          <input
            type="text"
            placeholder="搜尋股票代號、名稱、董監姓名..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
            autoFocus
          />
        </div>
      </header>

      {/* KPI Cards */}
      <section className="overview-grid">
        <div className="stat-card glass-card kpi-increase" onClick={() => { setActiveTab('changes'); setSortField('pledgedDiff'); setSortOrder('desc'); }}>
          <h3 className="stat-title">本期新增質押</h3>
          <div className="stat-value danger">{increasedPledges.length}</div>
          <div className="stat-desc">筆｜按此看詳細 →</div>
        </div>
        <div className="stat-card glass-card kpi-decrease" onClick={() => { setActiveTab('changes'); setSortField('pledgedDiff'); setSortOrder('asc'); }}>
          <h3 className="stat-title">本期解質 / 減質</h3>
          <div className="stat-value success">{decreasedPledges.length}</div>
          <div className="stat-desc">筆｜按此看詳細 →</div>
        </div>
        <div className="stat-card glass-card kpi-transfer" onClick={() => setActiveTab('transfer')}>
          <h3 className="stat-title">今日申報轉讓</h3>
          <div className="stat-value warn">{transferData.length}</div>
          <div className="stat-desc">筆｜內部人申報賣出/贈與 →</div>
        </div>
        <div className="stat-card glass-card kpi-risk">
          <h3 className="stat-title">高風險質押股數</h3>
          <div className="stat-value danger">{highRiskCount}</div>
          <div className="stat-desc">筆｜全市場質押比例 &gt; 50%</div>
        </div>
      </section>

      {/* Tab Navigation */}
      <nav className="tab-nav">
        <button
          className={`tab-button ${activeTab === 'changes' ? 'active' : ''}`}
          onClick={() => { setActiveTab('changes'); setSortField('pledgedDiff'); setSortOrder('asc'); }}
        >
          ⚡ 本期質押異動
          <span className={`tab-badge ${changedPledges.length > 0 ? 'danger-badge' : ''}`}>{changedPledges.length}</span>
        </button>
        <button
          className={`tab-button ${activeTab === 'transfer' ? 'active' : ''}`}
          onClick={() => { setActiveTab('transfer'); setSortField('transferShares'); setSortOrder('desc'); }}
        >
          📢 申報轉讓公告
          <span className={`tab-badge ${transferData.length > 0 ? 'danger-badge' : ''}`}>{transferData.length}</span>
        </button>
        <button
          className={`tab-button ${activeTab === 'all' ? 'active' : ''}`}
          onClick={() => { setActiveTab('all'); setSortField('ratio'); setSortOrder('desc'); }}
        >
          📋 全市場質押清單
          <span className="tab-badge">{pledgeData.length}</span>
        </button>
      </nav>

      {/* Main Table */}
      <section className="data-section glass-card">
        <div className="section-header">
          <div>
            <h2>
              {activeTab === 'changes' && '⚡ 本期質押異動紀錄（相較上一期有增減的董監事）'}
              {activeTab === 'transfer' && '📢 內部人事前申報轉讓日報'}
              {activeTab === 'all' && '📋 全市場有效質押清單'}
            </h2>
            {activeTab === 'changes' && changedPledges.length === 0 && (
              <p className="no-change-hint">⚠ 目前尚無異動紀錄。這通常表示系統只執行過一次更新，尚未累積第二個月的對比基期。請於下次證交所月報更新後（每月 16 日前後）再次執行 update.bat，即可看到增減差額。</p>
            )}
            <p className="table-info">
              共 <strong className="text-white">{processedList.length}</strong> 筆符合條件紀錄
            </p>
          </div>
          <button onClick={exportToCSV} className="action-button primary">📥 匯出 CSV</button>
        </div>

        <div className="table-container">
          {isPledgeTab ? (
            <table className="data-table">
              <thead>
                <tr>
                  <th onClick={() => handleSort('id')} className="sortable-th">代號 {renderSortIcon('id')}</th>
                  <th onClick={() => handleSort('name')} className="sortable-th">公司名稱 {renderSortIcon('name')}</th>
                  <th onClick={() => handleSort('director')} className="sortable-th">董監姓名 {renderSortIcon('director')}</th>
                  <th>職稱</th>
                  <th onClick={() => handleSort('pledgedDiff')} className="sortable-th text-right">本期異動(張) {renderSortIcon('pledgedDiff')}</th>
                  <th onClick={() => handleSort('pledged')} className="sortable-th text-right">現質設張數 {renderSortIcon('pledged')}</th>
                  <th onClick={() => handleSort('ratio')} className="sortable-th text-right">質押比例 {renderSortIcon('ratio')}</th>
                  <th onClick={() => handleSort('shares')} className="sortable-th text-right">持有張數 {renderSortIcon('shares')}</th>
                  <th onClick={() => handleSort('lastPledgeDate')} className="sortable-th">最後異動月份 {renderSortIcon('lastPledgeDate')}</th>
                </tr>
              </thead>
              <tbody>
                {paginatedData.length > 0 ? (
                  (paginatedData as PledgeData[]).map((item, idx) => (
                    <tr key={`${item.id}-${item.director}-${idx}`} className={item.warning ? 'row-warning' : ''}>
                      <td className="font-mono font-bold text-gray-300">{item.id}</td>
                      <td className="font-bold text-white">{item.name}</td>
                      <td className="text-gray-200">{item.director}</td>
                      <td><span className="badge">{item.title}</span></td>
                      <td className="text-right font-mono">
                        {(item.pledgedDiff || 0) > 0
                          ? <span className="diff-up">▲ +{fmt(item.pledgedDiff || 0)}</span>
                          : (item.pledgedDiff || 0) < 0
                          ? <span className="diff-down">▼ {fmt(item.pledgedDiff || 0)}</span>
                          : <span className="text-muted">—</span>}
                      </td>
                      <td className="text-right font-mono text-white font-bold">{fmt(item.pledged)}</td>
                      <td className="text-right">
                        <div className="progress-container">
                          <div className="progress-bar-bg">
                            <div className={`progress-bar-fill ${item.warning ? 'bg-danger' : 'bg-success'}`}
                              style={{ width: `${Math.min(item.ratio, 100)}%` }} />
                          </div>
                          <span className={`font-mono ${item.warning ? 'danger font-bold' : 'text-gray-300'}`}>
                            {item.ratio.toFixed(2)}%
                          </span>
                        </div>
                      </td>
                      <td className="text-right font-mono text-gray-300">{fmt(item.shares)}</td>
                      <td className="font-mono text-muted">{item.lastPledgeDate || item.date}</td>
                    </tr>
                  ))
                ) : (
                  <tr><td colSpan={9} className="empty-state">
                    {searchTerm ? `找不到符合「${searchTerm}」的資料` : '目前無異動資料'}
                  </td></tr>
                )}
              </tbody>
            </table>
          ) : (
            /* Transfer Notices Table */
            <table className="data-table">
              <thead>
                <tr>
                  <th onClick={() => handleSort('id')} className="sortable-th">代號 {renderSortIcon('id')}</th>
                  <th onClick={() => handleSort('name')} className="sortable-th">公司名稱 {renderSortIcon('name')}</th>
                  <th onClick={() => handleSort('director')} className="sortable-th">申報人姓名 {renderSortIcon('director')}</th>
                  <th>申報人身分</th>
                  <th>預定轉讓方式</th>
                  <th onClick={() => handleSort('transferShares')} className="sortable-th text-right">預定轉讓張數 {renderSortIcon('transferShares')}</th>
                  <th className="text-right">目前持有張數</th>
                  <th>受讓人</th>
                  <th>有效轉讓期間</th>
                </tr>
              </thead>
              <tbody>
                {paginatedData.length > 0 ? (
                  (paginatedData as TransferNotice[]).map((item, idx) => (
                    <tr key={`${item.key}-${idx}`}>
                      <td className="font-mono font-bold text-gray-300">{item.id}</td>
                      <td className="font-bold text-white">{item.name}</td>
                      <td className="text-gray-200">{item.director}</td>
                      <td><span className="badge danger-badge-style">{item.title}</span></td>
                      <td><span className="method-tag">{item.method}</span></td>
                      <td className="text-right font-mono danger font-bold">{fmt(item.transferShares)}</td>
                      <td className="text-right font-mono text-gray-300">{fmt(item.currentShares)}</td>
                      <td className="text-gray-300 text-sm">{item.recipient}</td>
                      <td className="font-mono text-muted">{item.validPeriod}</td>
                    </tr>
                  ))
                ) : (
                  <tr><td colSpan={9} className="empty-state">
                    {searchTerm ? `找不到符合「${searchTerm}」的資料` : '今日尚無申報轉讓公告'}
                  </td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>

        {totalPages > 1 && (
          <div className="pagination-container">
            <div className="pagination-info">
              第 {startIndex + 1}–{Math.min(startIndex + pageSize, processedList.length)} 筆，共 {processedList.length} 筆
            </div>
            <div className="pagination-controls">
              <button disabled={currentPage === 1} onClick={() => setCurrentPage(p => Math.max(p - 1, 1))} className="page-button">◀ 上一頁</button>
              <span className="page-indicator font-mono">{currentPage} / {totalPages}</span>
              <button disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))} className="page-button">下一頁 ▶</button>
              <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} className="page-size-select">
                <option value={20}>每頁 20 筆</option>
                <option value={50}>每頁 50 筆</option>
                <option value={100}>每頁 100 筆</option>
              </select>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

export default App;
