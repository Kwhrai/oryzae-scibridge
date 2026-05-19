import React, { useState, useMemo } from 'react';
import { 
  Database, 
  ShieldAlert, 
  BookOpen, 
  Copy, 
  CheckCircle, 
  Plus, 
  Search, 
  Bookmark, 
  BookmarkCheck,
  MessageSquare,
  Lightbulb,
  HeartPulse,
  Info,
  ExternalLink,
  FileText
} from 'lucide-react';

// スプレッドシート連携を模した初期論文データベース
const INITIAL_PAPERS = [
  {
    id: "paper-001",
    title: "熱処理耐性に優れた新規乳酸菌株（LP-99）の加熱殺菌飲料における安定性と腸内フローラ改善効果",
    author: "佐藤 健一、田中 美咲（乳酸菌応用研究所 / 2026年）",
    category: "腸活・バリア機能",
    ncbiUrl: "https://pubmed.ncbi.nlm.nih.gov/38291045/", // NCBIダミーURL
    driveUrl: "https://drive.google.com/drive/folders/1A2B3C4D5E6F_example", // Google DriveダミーURL
    abstract: "120℃・30秒の極限熱処理下でも生存率85%以上を維持する新規乳酸菌株LP-99を分離。本研究では、100名の中高年男女を対象とした臨床試験において、LP-99を加熱配合した温スープを4週間毎日摂取させたところ、プラセボ群と比較して糞便中のビフィズス菌比率が約2.4倍に増加、さらに唾液中IgA抗体（ウイルスなどの侵入を防ぐ免疫指標）の分泌速度が有意（p<0.05）に向上することが確認された。また、風邪症候群の初期症状（喉の痛み、だるさ）の継続期間が平均1.8日短縮した。",
    citation: "Sato K., Tanaka M. (2026). Thermal stability and immunological efficacy of Lactobacillus plantarum strain LP-99 in heated beverage matrices. Journal of Food Science and Biotechnology, 45(2), 112-121.",
    implications: "LP-99株は優れた耐熱性を持ち、120℃の加熱調理後でも生菌としての特性や機能を発揮できる。また、臨床試験により、経口摂取することで腸内環境を整え、上気道バリアの指標である唾液中IgA抗体の分泌を促進し、日常的な体調維持（バリア力）を科学的にサポートすることが強く示唆された。",
    marketingUseCases: [
      {
        channel: "CRM領域でどう活かせる？",
        idea: "「冷たいヨーグルトはお腹を冷やす」と敬遠するシニアや冷え性層向けに、『朝のホット乳酸菌温スープ』という新しい温活×腸活スタイルを提案し、定期継続率を高める。"
      },
      {
        channel: "メルマガ/LINE配信時の使い方ポイント",
        idea: "「冬を乗り切るバリアの科学」と題して、外敵から体を守る『IgA抗体』の役割を分かりやすく解説し、自社商品の技術的エビデンス（LP-99）を納得感とともに紹介する。"
      }
    ],
    yakkihou: {
      rdFact: "臨床試験において『唾液中IgA抗体の増加』および『風邪症状の継続期間の短縮』が証明されている。",
      dangerZone: "「風邪を引かないカラダに！」「インフルエンザ・ウイルス感染を予防！」「免疫力を劇的アップ！」「喉の痛み・風邪の諸症状を治す」といった表現は、医薬品的な治療・予防効果に該当し、食品では完全NG。",
      safeExpression: "「季節の変わり目に負けないカラダづくりの習慣に」「毎日のバリア力を中からサポート」「寒さに負けず、ハツラツとした健やかな日々を送りたい方に」",
      storyGuide: "『免疫・予防』という直接ワードを避け、『温かいスープで体を温めながら、内側のバリア力を底上げする新習慣』というストーリーを主軸に展開することで、健康維持の欲求に安全かつ強力に訴求できます。"
    }
  },
  {
    id: "paper-002",
    title: "大豆胚芽発酵物から単離した「アクティブペプチド-Soy22」の骨格筋萎縮抑制および筋タンパク質合成促進メカニズム",
    author: "高橋 誠、山本 祥子（素材機能探索グループ / 2025年）",
    category: "エイジングケア・シニア",
    ncbiUrl: "https://pubmed.ncbi.nlm.nih.gov/37482910/",
    driveUrl: "https://drive.google.com/drive/folders/2G3H4I5J6K7L_example",
    abstract: "加齢に伴う筋肉量低下（サルコペニア）を予防する食品成分の探索。大豆胚芽を特殊な乳酸菌で発酵させることで得られる「アクティブペプチド-Soy22」が、骨格筋細胞におけるmTORシグナル伝達経路を活性化し、筋タンパク質の合成を通常ペプチドの約1.8倍促進することをin vitro試験にて実証。さらに、50代後半〜70代の被験者40名を対象とした二重盲検比較試験において、Soy22（1日あたり500mg）の12週間摂取により、軽いウォーキングとの併用下で、大腿四頭筋の断面積がプラセボ群に比べ有意に増加（+4.2%）した。",
    citation: "Takahashi M., Yamamoto S. (2025). Soy germ-derived active peptide Soy22 stimulates muscle protein synthesis via mTOR pathway and prevents sarcopenia: A double-blind clinical trial. Nutrition & Metabolic Insights, 18, 54-63.",
    implications: "加齢により低下しやすい『下半身の筋肉合成スイッチ』を、少量の「Soy22」がダイレクトに刺激することを示唆。プロテインを大量に摂取しにくい高齢層でも、軽い散歩と組み合わせることで効率的に『太ももの筋肉量（大腿四頭筋）』を維持・増加させることが可能であると実証された。",
    marketingUseCases: [
      {
        channel: "CRM領域でどう活かせる？",
        idea: "「10年後も自分の足で旅行に行くために」をテーマに、お茶うけや味噌汁に混ぜて摂れる『食べる歩行対策ペプチド』として、無理なく続けられる筋力アプローチを訴求。"
      },
      {
        channel: "メルマガ/LINE配信時の使い方ポイント",
        idea: "40〜50代の子世代に向け、「実家のご両親へ健康寿命を贈る」という見守りギフト文脈で、信頼できる医学的臨床エビデンスをベースにした高級感あるキャンペーンを設計。"
      }
    ],
    yakkihou: {
      rdFact: "臨床試験において、軽いウォーキング併用により『太ももの筋肉量（大腿四頭筋断面積）』が有意に増加した。",
      dangerZone: "「飲むだけで筋肉がモリモリつく」「ロコモティブシンドローム（運動器症候群）が完治」「寝たきりを100%予防」「萎縮した足腰が若返る」などの表現は、治療効果や身体機能の改変表現に当たり薬事NG。運動なしで筋肉が増えるかのような過大表現も景表法違反。",
      safeExpression: "「年齢に負けない、スムーズで力強い一歩を」「ハツラツと歩き続けたいアクティブ世代の基礎づくりに」「軽い運動との掛け合わせで、毎日の自立した歩みをサポート」",
      storyGuide: "「飲むだけで勝手に筋肉がつく」ではなく、実証データの前提条件である「軽い運動（お散歩や家事、軽いストレッチ）との掛け合わせの重要性」を誠実に語ることが、景表法上の信頼獲得と、薬機法をクリアした魅力的なストーリー構築のコツです。"
    }
  },
  {
    id: "paper-003",
    title: "乳酸菌発酵トマト由来GABAの自律神経調整を介した睡眠の質改善および血管弾性維持効果",
    author: "渡辺 健二、鈴木 拓海（デジタルフードサイエンス部 / 2026年）",
    category: "睡眠・メンタル・血圧",
    ncbiUrl: "https://pubmed.ncbi.nlm.nih.gov/39102485/",
    driveUrl: "https://drive.google.com/drive/folders/3M4N5O6P7Q8R_example",
    abstract: "トマトに含まれるアミノ酸を乳酸菌発酵プロセスにより高濃度GABAへと変換。一時的な精神的ストレスを抱える被験者50名を対象にした脳波・心拍変動解析において、GABA（100mg/日）の就寝前摂取により、入眠初期 of 深睡眠（徐波睡眠）の時間が約35%延長し、自律神経のバランス（交感神経抑制/副交感神経活性化）が正常に調整されることが明らかとなった。長期摂取（8週間）により、血管の柔軟性（弾性）を示す血管硬化度の改善（p<0.01）および、高め血圧の有意な低下傾向も併せて確認された。",
    citation: "Watanabe K., Suzuki T. (2026). Lactobacilli-fermented tomato GABA improves deep sleep quality and arterial stiffness through autonomic nervous system modulation. Journal of Functional Foods, 104, 103950.",
    implications: "発酵トマト由来GABAの摂取は、自律神経をリラックス状態（副交感神経優位）へと導き、深い睡眠（ノンレム睡眠）の質を向上させる。さらに、長期的には血管の柔軟性（弾力）を守り、高めである血圧を穏やかに抑えるという、現代人の「睡眠不足と血管リスク」に対する多角的な機能性が示唆された。",
    marketingUseCases: [
      {
        channel: "CRM領域でどう活かせる？",
        idea: "「スマホのピリピリをオフにする夜用トマトスープ」を提案。1日頑張った脳と体をいたわる『夜のナイトルーティン』として、睡眠の質改善をフックにした新市場を開拓する。"
      },
      {
        channel: "メルマガ/LINE配信時の使い方ポイント",
        idea: "「塩分カットだけで血圧対策はつまらない」と感じる層へ、真っ赤なトマトの贅沢な美味しさを楽しみながら血管のしなやかさを保つ『美味しい血圧習慣』をエビデンス付きで届ける。"
      }
    ],
    yakkihou: {
      rdFact: "就寝前GABA摂取により『深睡眠時間が35%延長』、および長期摂取で『血管弾性の改善・血圧低下』が証明された。",
      dangerZone: "「不眠症を解消」「睡眠薬代わりに深く眠れる」「高血圧や動脈硬化を予防・治療する」「ドロドロ血や血管硬化を治して若返らせる」は、病気の治療・予防表現になり完全にNG。",
      safeExpression: "「スッキリとした心地よい目覚めをサポート」「一時的な精神的ストレスを和らげて穏やかな夜に」「高めの血圧が気になる方の健康習慣に」「しなやかで健やかなめぐりをサポート」",
      storyGuide: "睡眠の『治療薬』ではなく、自律神経がオンからオフへと『自然に切り替わる準備時間』を美味しく演出し、翌朝の心地よい「目覚めのすっきり感」に焦点を当てることで、ユーザーの情緒的かつ安全なナーチャリングストーリーを展開可能です。"
    }
  }
];

export default function App() {
  const [papers, setPapers] = useState(INITIAL_PAPERS);
  
  // 動的ジャンル管理用State
  const [categories, setCategories] = useState(["腸活・バリア機能", "エイジングケア・シニア", "睡眠・メンタル・血圧"]);
  const [newGenre, setNewGenre] = useState("");
  
  const [selectedCategory, setSelectedCategory] = useState("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [bookmarks, setBookmarks] = useState(["paper-001"]);
  const [activeTab, setActiveTab] = useState("database"); // 'database' | 'register'
  
  // 論文ごとのサブタブの状態: { [paperId]: 'info' | 'marketing' | 'yakki' }
  const [cardTabs, setCardTabs] = useState({
    "paper-001": "info",
    "paper-002": "info",
    "paper-003": "info"
  });

  // 新規登録フォーム用State
  const [newTitle, setNewTitle] = useState("");
  const [newAuthor, setNewAuthor] = useState("");
  const [newCategory, setNewCategory] = useState("腸活・バリア機能");
  const [newNcbiUrl, setNewNcbiUrl] = useState("");
  const [newDriveUrl, setNewDriveUrl] = useState("");
  const [newAbstract, setNewAbstract] = useState("");
  const [newCitation, setNewCitation] = useState("");
  const [newImplications, setNewImplications] = useState("");
  const [newMarketingIdea1, setNewMarketingIdea1] = useState("");
  const [newMarketingIdea2, setNewMarketingIdea2] = useState("");
  const [newRdFact, setNewRdFact] = useState("");
  const [newDangerZone, setNewDangerZone] = useState("");
  const [newSafeExpression, setNewSafeExpression] = useState("");
  const [newStoryGuide, setNewStoryGuide] = useState("");

  const [toast, setToast] = useState(null);

  const triggerToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  // ジャンルの動的追加
  const handleAddGenre = (e) => {
    e.preventDefault();
    const formattedGenre = newGenre.trim();
    if (!formattedGenre) {
      triggerToast("ジャンル名を入力してください。");
      return;
    }
    if (categories.includes(formattedGenre)) {
      triggerToast("そのジャンルは既に存在します。");
      return;
    }
    setCategories([...categories, formattedGenre]);
    setNewGenre("");
    triggerToast(`新しいジャンル「${formattedGenre}」を追加しました！`);
  };

  const toggleBookmark = (id) => {
    if (bookmarks.includes(id)) {
      setBookmarks(bookmarks.filter(b => b !== id));
      triggerToast("お気に入りから削除しました");
    } else {
      setBookmarks([...bookmarks, id]);
      triggerToast("お気に入りに追加しました");
    }
  };

  const handleCardTabChange = (paperId, tab) => {
    setCardTabs(prev => ({ ...prev, [paperId]: tab }));
  };

  const copyToClipboard = (text, label) => {
    navigator.clipboard.writeText(text);
    triggerToast(`${label}をコピーしました！`);
  };

  const filteredPapers = useMemo(() => {
    return papers.filter(p => {
      const matchCategory = selectedCategory === "ALL" || p.category === selectedCategory;
      const matchSearch = p.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          p.abstract.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          p.implications.toLowerCase().includes(searchQuery.toLowerCase());
      return matchCategory && matchSearch;
    });
  }, [papers, selectedCategory, searchQuery]);

  // 新規論文登録の処理
  const handleRegisterPaper = (e) => {
    e.preventDefault();
    if (!newTitle || !newAbstract) {
      triggerToast("タイトルとAbstractは必須です。");
      return;
    }

    const newPaperId = `paper-00${papers.length + 1}`;
    const newPaper = {
      id: newPaperId,
      title: newTitle,
      author: newAuthor || "R&D開発推進部 (2026年)",
      category: newCategory,
      ncbiUrl: newNcbiUrl || "https://pubmed.ncbi.nlm.nih.gov/",
      driveUrl: newDriveUrl || "https://drive.google.com/",
      abstract: newAbstract,
      citation: newCitation || "R&D Internal Report (2026). unpublished database.",
      implications: newImplications || "本研究の結果から、特定の健康ベネフィットへの寄与が期待されます。",
      marketingUseCases: [
        {
          channel: "CRM領域でどう活かせる？",
          idea: newMarketingIdea1 || "科学的発見ストーリーを情緒的に再構築してファンを増やす。"
        },
        {
          channel: "メルマガ/LINE配信時の使い方ポイント",
          idea: newMarketingIdea2 || "日常の健康習慣に関連づけて、商品の独自価値として発信する。"
        }
      ],
      yakkihou: {
        rdFact: newRdFact || "臨床にて良好なデータ変化が有意に確認されている。",
        dangerZone: newDangerZone || "身体の特定部位の改善や、病気の予防/治療を明言する表現は避けてください。",
        safeExpression: newSafeExpression || "「健やかな毎日を維持する」「内側からすっきりとサポート」",
        storyGuide: newStoryGuide || "研究背景にある『人々の健康課題』に焦点をあて、ライフスタイルの提案に置き換えて優しく発信します。"
      }
    };

    setPapers([newPaper, ...papers]);
    setCardTabs(prev => ({ ...prev, [newPaperId]: 'info' }));
    triggerToast("新規R&Dエビデンスを登録し、両チーム共用データベースへ追加しました！");
    
    // フォームクリア
    setNewTitle("");
    setNewAuthor("");
    setNewNcbiUrl("");
    setNewDriveUrl("");
    setNewAbstract("");
    setNewCitation("");
    setNewImplications("");
    setNewMarketingIdea1("");
    setNewMarketingIdea2("");
    setNewRdFact("");
    setNewDangerZone("");
    setNewSafeExpression("");
    setNewStoryGuide("");
    
    setActiveTab("database");
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col font-sans antialiased">
      
      <style dangerouslySetInnerHTML={{__html: `
        body, html, #root, input, textarea, select, button, p, h1, h2, h3, h4, span, div, a {
          font-family: Arial, "Yu Gothic", "YuGothic", "Hiragino Kaku Gothic ProN", "Meiryo", sans-serif !important;
        }
      `}} />

      {/* トースト通知インジケーター */}
      {toast && (
        <div className="fixed top-6 right-6 z-50 flex items-center gap-2.5 bg-slate-900 text-white border-l-4 border-[#4682B4] px-5 py-3.5 rounded-xl shadow-2xl animate-slideIn">
          <CheckCircle className="h-5 w-5 text-[#4682B4] shrink-0 animate-bounce" />
          <p className="text-xs font-semibold leading-relaxed">{toast}</p>
        </div>
      )}

      {/* ヘッダーエリア (白基調 / スチールブルーアクセント) */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex flex-col sm:flex-row items-center justify-between py-2 sm:py-0">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-[#4682B4] flex items-center justify-center shadow-md shadow-[#4682B4]/15">
              <HeartPulse className="h-5 w-5 text-white stroke-[2.5px]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-black text-slate-900 tracking-wider">ORYZAE SciBridge</h1>
                <span className="bg-[#4682B4]/10 text-[#4682B4] border border-[#4682B4]/20 text-[9px] font-bold px-1.5 py-0.5 rounded">R&D × Marketing</span>
              </div>
              <p className="text-[10px] text-slate-500">R&D論文エビデンス翻訳 ＆ 薬機法ガードレール・共用プラットフォーム</p>
            </div>
          </div>

          <nav className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 mt-2 sm:mt-0">
            <button 
              onClick={() => setActiveTab("database")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition ${activeTab === "database" ? "bg-white text-[#4682B4] shadow-sm border border-slate-200" : "text-slate-500 hover:text-slate-800"}`}
            >
              <Database className="h-3.5 w-3.5" />
              共用論文DB
            </button>
            <button 
              onClick={() => setActiveTab("register")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition ${activeTab === "register" ? "bg-white text-[#4682B4] shadow-sm border border-slate-200" : "text-slate-500 hover:text-slate-800"}`}
            >
              <Plus className="h-3.5 w-3.5" />
              R&D論文登録
            </button>
          </nav>
        </div>
      </header>

      {/* メインレイアウトエリア */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 flex flex-col gap-6">
        
        {/* タブ 1: 論文カード（箱）データベース画面 */}
        {activeTab === "database" && (
          <div className="space-y-6 flex-1 flex flex-col justify-between">
            
            <div className="space-y-6">
              {/* 検索 ＆ カテゴリーフィルタ ＆ 動的ジャンル作成 */}
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col lg:flex-row gap-4 items-center justify-between">
                
                {/* 検索入力 */}
                <div className="relative w-full lg:w-72">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Search className="h-4 w-4 text-slate-400" />
                  </span>
                  <input 
                    type="text"
                    placeholder="論文タイトルやキーワードで検索..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-9 pr-4 py-2 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#4682B4] focus:bg-white transition"
                  />
                </div>

                {/* 動的ジャンルフィルター ＆ ジャンル追加フォーム */}
                <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3 w-full lg:w-auto">
                  
                  {/* ジャンルボタン */}
                  <div className="flex gap-1.5 overflow-x-auto pb-1 md:pb-0 scrollbar-none max-w-full md:max-w-[400px] lg:max-w-[500px]">
                    <button
                      onClick={() => setSelectedCategory("ALL")}
                      className={`px-3 py-1.5 rounded-lg text-[11px] font-black whitespace-nowrap border transition ${selectedCategory === "ALL" ? 'bg-[#4682B4] text-white border-[#4682B4] shadow-sm' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}
                    >
                      ALL
                    </button>
                    {categories.map(cat => (
                      <button
                        key={cat}
                        onClick={() => setSelectedCategory(cat)}
                        className={`px-3 py-1.5 rounded-lg text-[11px] font-black whitespace-nowrap border transition ${selectedCategory === cat ? 'bg-[#4682B4] text-white border-[#4682B4] shadow-sm' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>

                  {/* ジャンル追加フォーム */}
                  <form onSubmit={handleAddGenre} className="flex gap-1.5 items-center shrink-0 border-l border-slate-200 pl-3">
                    <input 
                      type="text"
                      placeholder="新ジャンルを追加..."
                      value={newGenre}
                      onChange={(e) => setNewGenre(e.target.value)}
                      className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-[11px] placeholder-slate-400 focus:outline-none focus:border-[#4682B4] w-32"
                    />
                    <button
                      type="submit"
                      className="p-1.5 rounded-lg bg-slate-100 hover:bg-[#4682B4] text-slate-600 hover:text-white border border-slate-200 transition"
                      title="ジャンルを追加"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </form>
                </div>

              </div>

              {/* 論文カードグリッド（論文別個別の箱） */}
              <div className="grid grid-cols-1 gap-6">
                
                {filteredPapers.length > 0 ? (
                  filteredPapers.map(paper => {
                    const currentTab = cardTabs[paper.id] || "info";
                    const isBookmarked = bookmarks.includes(paper.id);

                    return (
                      <div 
                        key={paper.id}
                        className="rounded-2xl bg-white border border-slate-200 hover:border-slate-300 shadow-sm hover:shadow-md transition-all overflow-hidden flex flex-col justify-between"
                      >
                        {/* カードヘッダー */}
                        <div className="p-5 border-b border-slate-100 bg-slate-50/70 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="bg-[#4682B4]/10 text-[#4682B4] border border-[#4682B4]/20 text-[10px] font-bold px-2 py-0.5 rounded">
                                {paper.category}
                              </span>
                              <span className="text-[10px] text-slate-400 font-mono">ID: {paper.id}</span>
                            </div>
                            <h3 className="text-sm sm:text-base font-black text-slate-950 hover:text-[#4682B4] transition leading-snug">
                              {paper.title}
                            </h3>
                          </div>

                          {/* お気に入り追加ピン */}
                          <div className="flex items-center gap-2 shrink-0 self-start sm:self-center">
                            <button 
                              onClick={() => toggleBookmark(paper.id)}
                              className={`p-2 rounded-lg border transition ${isBookmarked ? 'bg-[#4682B4]/10 text-[#4682B4] border-[#4682B4]/20' : 'bg-white text-slate-400 border-slate-200 hover:text-slate-600 hover:bg-slate-50'}`}
                              title="お気に入りに登録"
                            >
                              {isBookmarked ? <BookmarkCheck className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
                            </button>
                          </div>
                        </div>

                        {/* カード内ナビゲーション（スチールブルーに合わせたモダンタブ） */}
                        <div className="bg-slate-50/30 px-4 py-2 border-b border-slate-100 flex flex-wrap gap-1 justify-start">
                          <button
                            onClick={() => handleCardTabChange(paper.id, 'info')}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-all ${currentTab === 'info' ? 'bg-white text-[#4682B4] border border-slate-200 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                          >
                            <BookOpen className="h-3.5 w-3.5" />
                            1. 論文・概要情報
                          </button>
                          <button
                            onClick={() => handleCardTabChange(paper.id, 'marketing')}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-all ${currentTab === 'marketing' ? 'bg-white text-[#4682B4] border border-slate-200 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                          >
                            <Lightbulb className="h-3.5 w-3.5" />
                            2. マーケ・営業活用方法
                          </button>
                          <button
                            onClick={() => handleCardTabChange(paper.id, 'yakki')}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-all ${currentTab === 'yakki' ? 'bg-white text-red-600 border border-slate-200 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                          >
                            <ShieldAlert className="h-3.5 w-3.5" />
                            3. 薬機法注意点
                          </button>
                        </div>

                        {/* カード本体コンテンツ */}
                        <div className="p-6">
                          
                          {/* TAB 1: 論文・概要情報 (和文タイトル・Abstract・出典・各種スプシ論文URL) */}
                          {currentTab === 'info' && (
                            <div className="space-y-5">
                              <div className="flex flex-col sm:flex-row justify-between gap-3">
                                <div>
                                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">共同著者 ＆ 登録組織</span>
                                  <p className="text-xs text-slate-700 font-medium">{paper.author}</p>
                                </div>
                                
                                {/* 🔗 Googleスプレッドシート上の論文URLに直接飛ぶリンクボタン */}
                                <div className="flex flex-wrap gap-2 self-start sm:self-center">
                                  {paper.ncbiUrl && (
                                    <a 
                                      href={paper.ncbiUrl} 
                                      target="_blank" 
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[10px] font-bold bg-white text-slate-700 border border-slate-200 hover:border-slate-300 rounded-lg transition"
                                    >
                                      <ExternalLink className="h-3 w-3 text-[#4682B4]" />
                                      NCBIで原文を読む
                                    </a>
                                  )}
                                  {paper.driveUrl && (
                                    <a 
                                      href={paper.driveUrl} 
                                      target="_blank" 
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[10px] font-bold bg-[#4682B4]/10 text-[#4682B4] border border-[#4682B4]/20 hover:bg-[#4682B4]/15 rounded-lg transition"
                                    >
                                      <FileText className="h-3 w-3" />
                                      Google Driveで関連資料
                                    </a>
                                  )}
                                </div>
                              </div>
                              
                              <div>
                                <span className="text-[10px] font-bold text-[#4682B4] uppercase tracking-wider block mb-1">Abstract</span>
                                <p className="text-xs text-slate-650 leading-relaxed bg-slate-50 p-4 rounded-xl border border-slate-100">
                                  {paper.abstract}
                                </p>
                              </div>

                              {/* 出典コピーパネル */}
                              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                  <span className="text-[10px] font-bold text-[#4682B4] uppercase tracking-wider block">
                                    出典名（引用時にお使いください）
                                  </span>
                                  <button 
                                    onClick={() => copyToClipboard(paper.citation, "引用文献名")}
                                    className="text-[10px] text-[#4682B4] hover:text-[#4682B4]/80 font-bold flex items-center gap-1 bg-white px-2 py-1 rounded border border-slate-200 hover:bg-slate-50 transition shrink-0 self-start sm:self-auto"
                                  >
                                    <Copy className="h-3 w-3" />
                                    出典をコピーする
                                  </button>
                                </div>
                                <p className="text-xs text-slate-700 font-mono bg-white p-3 rounded-lg border border-slate-100 select-all leading-normal">
                                  {paper.citation}
                                </p>
                              </div>
                            </div>
                          )}

                          {/* TAB 2: マーケ・営業活用方法 (解説・CRM・LINE) */}
                          {currentTab === 'marketing' && (
                            <div className="space-y-4">
                              
                              {/* わかりやすく解説 */}
                              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                                <span className="text-[10px] font-black text-[#4682B4] uppercase tracking-wider flex items-center gap-1 mb-1.5">
                                  <Lightbulb className="h-3.5 w-3.5" />
                                  わかりやすく解説
                                </span>
                                <p className="text-xs text-slate-700 leading-relaxed font-medium">
                                  {paper.implications}
                                </p>
                              </div>

                              {/* マーケ・CRM施策アイデア */}
                              <div>
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-2">具体的なマーケ・営業施策での活用方法</span>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                  {paper.marketingUseCases.map((useCase, idx) => (
                                    <div key={idx} className="p-4 rounded-xl bg-slate-50/60 border border-slate-200/60 space-y-2">
                                      <div className="flex items-center gap-1.5 border-b border-slate-200 pb-1.5">
                                        <MessageSquare className="h-3.5 w-3.5 text-[#4682B4]" />
                                        <span className="text-xs font-bold text-slate-800">{useCase.channel}</span>
                                      </div>
                                      <p className="text-xs text-slate-600 leading-relaxed">
                                        {useCase.idea}
                                      </p>
                                    </div>
                                  ))}
                                </div>
                              </div>

                            </div>
                          )}

                          {/* TAB 3: 薬機法注意点 (薬事チェック・ストーリーガイド) */}
                          {currentTab === 'yakki' && (
                            <div className="space-y-4">
                              
                              {/* 薬事表現対比表 */}
                              <div className="p-4 rounded-xl border border-red-100 bg-red-50/30 space-y-3.5">
                                <span className="text-[10px] font-black text-red-700 uppercase tracking-wider flex items-center gap-1">
                                  <ShieldAlert className="h-4 w-4 text-red-600" />
                                  薬機法遵守ガイドライン
                                </span>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                  <div className="space-y-1">
                                    <span className="text-[9px] font-bold text-slate-500 block">R&Dが証明したエビデンス（事実）</span>
                                    <p className="text-[11px] text-slate-700 bg-white p-2.5 rounded border border-slate-200">{paper.yakkihou.rdFact}</p>
                                  </div>
                                  <div className="space-y-1">
                                    <span className="text-[9px] font-black text-red-600 block">❌ 薬事NG表現（こう言ってしまうと違法）</span>
                                    <p className="text-[11px] text-red-700 bg-red-50/50 p-2.5 rounded border border-red-100 leading-normal font-bold">{paper.yakkihou.dangerZone}</p>
                                  </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-red-100/40 pt-3">
                                  <div className="space-y-1">
                                    <span className="text-[9px] font-black text-[#4682B4] block">✅ OKセーフ表現例（代替言い換え表現）</span>
                                    <div className="bg-[#4682B4]/10 p-2.5 rounded border border-[#4682B4]/20">
                                      <p className="text-[11px] text-[#4682B4] font-black leading-relaxed">{paper.yakkihou.safeExpression}</p>
                                      <button 
                                        onClick={() => copyToClipboard(paper.yakkihou.safeExpression, "セーフ表現")}
                                        className="text-[9px] text-[#4682B4] font-bold hover:underline flex items-center gap-1 mt-1.5"
                                      >
                                        <Copy className="h-2.5 w-2.5" /> この表現をコピー
                                      </button>
                                    </div>
                                  </div>
                                  <div className="space-y-1">
                                    <span className="text-[9px] font-bold text-slate-500 block">💡 安全なナーチャリングストーリーの描き方</span>
                                    <p className="text-[11px] text-slate-600 leading-relaxed font-medium">{paper.yakkihou.storyGuide}</p>
                                  </div>
                                </div>
                              </div>

                            </div>
                          )}

                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="bg-white text-slate-400 rounded-2xl p-12 text-center border border-slate-200">
                    <Database className="h-8 w-8 mx-auto text-slate-300 mb-2" />
                    <p className="text-sm font-bold">該当する論文が見つかりません</p>
                    <p className="text-xs mt-1 text-slate-500">キーワードまたはフィルター条件を変えてお試しください。</p>
                  </div>
                )}

              </div>
            </div>

            {/* スプレッドシート連携 ＆ 知見マニュアルバナー */}
            <div className="p-6 mt-10 rounded-2xl bg-gradient-to-br from-slate-50 to-white border border-[#4682B4]/20 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="max-w-3xl">
                <span className="inline-flex items-center gap-1 bg-[#4682B4]/10 border border-[#4682B4]/20 text-[#4682B4] text-[10px] font-bold px-2.5 py-1 rounded-full mb-2">
                  <Info className="h-3.5 w-3.5" /> スプレッドシート連携・活用マニュアル
                </span>
                <h2 className="text-base font-black text-slate-900">科学的知見の管理・活用をもっとスムーズに</h2>
                <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                  本システムは、R&Dチームが使い慣れたGoogleスプレッドシートや共有Driveとのシームレスな自動同期を想定して設計されています。
                  R&Dメンバーがシートに新規論文のタイトル、Abstract、NCBI等の論文URL、社内資料Driveリンクを追加するだけで、マーケティングチームは即座に「顧客への伝わるメッセージ」と「薬事上のセーフライン」をこの画面から抽出し、コピーして日々のメルマガや配信に活用可能です。
                </p>
              </div>
              <div className="flex gap-2 self-start md:self-center">
                <div className="bg-white p-3 rounded-xl border border-slate-200 text-center shrink-0 shadow-sm min-w-[70px]">
                  <p className="text-[10px] text-slate-400 font-bold uppercase">登録総数</p>
                  <p className="text-base font-black text-slate-800">{papers.length} 件</p>
                </div>
                <div className="bg-white p-3 rounded-xl border border-slate-200 text-center shrink-0 shadow-sm min-w-[70px]">
                  <p className="text-[10px] text-slate-400 font-bold uppercase">お気に入り</p>
                  <p className="text-base font-black text-[#4682B4]">{bookmarks.length} 件</p>
                </div>
              </div>
            </div>

          </div>
        )}

        {/* タブ 2: 新規論文登録画面 (R&Dインプット / スプレッドシート同期シミュレーション用) */}
        {activeTab === "register" && (
          <div className="space-y-6">
            <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-sm">
              <h2 className="text-sm sm:text-base font-bold text-slate-900 flex items-center gap-2">
                <Database className="h-5 w-5 text-[#4682B4]" />
                R&D（研究開発）チーム用・新規エビデンス登録
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                新しく分離した菌株や素材、臨床データを追加登録します。
                ここで登録されたデータは、即座にマーケティング部門側で「薬機法翻訳カード」として共有・ナーチャリングに活用可能になります。
              </p>
            </div>

            <form onSubmit={handleRegisterPaper} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6">
              
              {/* 基礎学術データ（R&D入力項目） */}
              <div className="space-y-4">
                <h3 className="text-xs font-black text-[#4682B4] uppercase tracking-wider border-b border-slate-100 pb-2">
                  1. 基礎学術データ（R&D入力項目）
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1">論文タイトル (和文) *</label>
                    <input 
                      type="text"
                      required
                      value={newTitle}
                      onChange={(e) => setNewTitle(e.target.value)}
                      placeholder="例：〇〇ポリフェノールによる血流改善作用と体感疲労軽減に関する二重盲検試験"
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-[#4682B4] focus:bg-white transition"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1">カテゴリー (動的リスト)</label>
                    <select
                      value={newCategory}
                      onChange={(e) => setNewCategory(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-[#4682B4] focus:bg-white transition"
                    >
                      {categories.map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* スプシから読み込まれる論文URL欄（NCBI/Google Drive） */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1">NCBI 論文リンクURL（任意）</label>
                    <input 
                      type="url"
                      value={newNcbiUrl}
                      onChange={(e) => setNewNcbiUrl(e.target.value)}
                      placeholder="https://pubmed.ncbi.nlm.nih.gov/xxxxxx/"
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-[#4682B4] focus:bg-white transition"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1">Google Drive 関連資料フォルダURL（任意）</label>
                    <input 
                      type="url"
                      value={newDriveUrl}
                      onChange={(e) => setNewDriveUrl(e.target.value)}
                      placeholder="https://drive.google.com/drive/folders/xxxxxx"
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-[#4682B4] focus:bg-white transition"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1">共同著者 ＆ 登録組織 *</label>
                    <input 
                      type="text"
                      value={newAuthor}
                      onChange={(e) => setNewAuthor(e.target.value)}
                      placeholder="例：山田 太郎（新規素材探索開発グループ / 2026年）"
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-[#4682B4] focus:bg-white transition"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1">出典名（引用時にお使いください） *</label>
                    <input 
                      type="text"
                      value={newCitation}
                      onChange={(e) => setNewCitation(e.target.value)}
                      placeholder="例：Yamada T. (2026). Efficacy of Polyphenols on Blood Flow... Journal of Health Science, 12, 45-53."
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-[#4682B4] focus:bg-white transition"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-1">Abstract *</label>
                  <textarea
                    required
                    value={newAbstract}
                    onChange={(e) => setNewAbstract(e.target.value)}
                    rows={4}
                    placeholder="臨床試験条件、対象データ、生理的な確認数値を分かりやすく記述してください。"
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs text-slate-800 focus:outline-none focus:border-[#4682B4] focus:bg-white transition"
                  />
                </div>
              </div>

              {/* 科学的示唆 ＆ 施策アイデア（両部門共用） */}
              <div className="space-y-4 pt-4 border-t border-slate-100">
                <h3 className="text-xs font-black text-[#4682B4] uppercase tracking-wider border-b border-slate-100 pb-2">
                  2. 科学的示唆 ＆ 施策アイデア（両部門共用）
                </h3>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-1">わかりやすく解説</label>
                  <textarea
                    value={newImplications}
                    onChange={(e) => setNewImplications(e.target.value)}
                    rows={2}
                    placeholder="臨床データの意味合いを分かりやすく解きほぐした、本質的な提供ベネフィットを記述します。"
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs text-slate-800 focus:outline-none focus:border-[#4682B4] focus:bg-white transition"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                    <span className="text-[10px] font-bold text-slate-700 block border-b border-slate-200 pb-1">CRM領域でどう活かせる？</span>
                    <div>
                      <textarea 
                        value={newMarketingIdea1}
                        onChange={(newVal) => setNewMarketingIdea1(newVal.target.value)}
                        rows={3}
                        placeholder="例：臨床データを活用し、体内の変化ストーリーを情緒的に再構成して配信する。"
                        className="w-full bg-white border border-slate-200 rounded p-2 text-xs text-slate-800 focus:outline-none focus:border-[#4682B4]"
                      />
                    </div>
                  </div>

                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                    <span className="text-[10px] font-bold text-slate-700 block border-b border-slate-200 pb-1">メルマガ/LINE配信時の使い方ポイント</span>
                    <div>
                      <textarea 
                        value={newMarketingIdea2}
                        onChange={(newVal) => setNewMarketingIdea2(newVal.target.value)}
                        rows={3}
                        placeholder="例：毎朝の健康習慣にこの素材を組み込むライフスタイルコラム。"
                        className="w-full bg-white border border-slate-200 rounded p-2 text-xs text-slate-800 focus:outline-none focus:border-[#4682B4]"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* 薬機法ガードレール（薬事監修） */}
              <div className="space-y-4 pt-4 border-t border-slate-100">
                <h3 className="text-xs font-black text-red-600 uppercase tracking-wider border-b border-slate-100 pb-2">
                  3. 薬機法ガードレール・注意点（薬事監修）
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1">R&Dエビデンス（事実）</label>
                    <input 
                      type="text"
                      value={newRdFact}
                      onChange={(e) => setNewRdFact(e.target.value)}
                      placeholder="例：血流改善による指先表面温度の有意な上昇"
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-[#4682B4] focus:bg-white transition"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-red-600 mb-1">❌ 薬事NG表現（こう言ったらアウト）</label>
                    <input 
                      type="text"
                      value={newDangerZone}
                      onChange={(e) => setNewDangerZone(e.target.value)}
                      placeholder="例：『冷え性を治療する！手先を温め血流を正常化』"
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-[#4682B4] focus:bg-white transition"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-blue-600 mb-1">✅ OKセーフ表現（これなら大丈夫）</label>
                    <input 
                      type="text"
                      value={newSafeExpression}
                      onChange={(e) => setNewSafeExpression(e.target.value)}
                      placeholder="例：『冬の肌寒い日にも、指先までぽかぽかを応援します』"
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-[#4682B4] focus:bg-white transition"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1">💡 ナーチャリングストーリーの方向性</label>
                    <input 
                      type="text"
                      value={newStoryGuide}
                      onChange={(e) => setNewStoryGuide(e.target.value)}
                      placeholder="例：『毎日のあったか温活習慣』のように日常行動の提案に落とし込みます。"
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-[#4682B4] focus:bg-white transition"
                    />
                  </div>
                </div>
              </div>

              {/* 保存ボタン */}
              <div className="flex justify-end pt-3">
                <button
                  type="submit"
                  className="bg-[#4682B4] hover:bg-[#4682B4]/90 text-white font-black text-xs px-8 py-3 rounded-xl transition shadow-md shadow-[#4682B4]/15"
                >
                  このデータを共用データベースに保存
                </button>
              </div>

            </form>
          </div>
        )}

      </main>

      {/* フッター */}
      <footer className="bg-white border-t border-slate-200 py-8 text-center mt-12 shadow-inner">
        <p className="text-[11px] text-slate-400 font-medium">
          &copy; 2026 ORYZAE SciBridge | R&D & Marketing Strategic Workspace
        </p>
      </footer>

    </div>
  );
}