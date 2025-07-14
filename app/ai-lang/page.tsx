'use client';

import { useState, useEffect, useRef } from 'react';
import { db } from '@/services/firebase';
import {
  collection,
  addDoc,
  getDocs,
  query,
  orderBy
} from 'firebase/firestore';

interface WordData {
  單字清單: string[];
  單字中文意思: string[];
}

interface SentenceData {
  例句: string;
  例句中文意思: string;
}

interface WordGroup {
  id: string;
  keyword: string;
  language: string;
  languageName: string;
  wordData: WordData;
  sentences: { [word: string]: SentenceData };
  createdAt: Date;
}

interface ApiResponse {
  success: boolean;
  data?: WordData;
  error?: string;
  keyword?: string;
  language?: string;
}

interface SentenceApiResponse {
  success: boolean;
  data?: SentenceData;
  error?: string;
  word?: string;
  language?: string;
}

export default function AILangPage() {
  const [keyword, setKeyword] = useState('');
  const [selectedLanguage, setSelectedLanguage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [wordGroups, setWordGroups] = useState<WordGroup[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [generatingSentences, setGeneratingSentences] = useState<{ [key: string]: boolean }>({});
  const [playingAudio, setPlayingAudio] = useState<{ [key: string]: boolean }>({});
  const [audioCache, setAudioCache] = useState<{ [key: string]: string }>({});
  const audioRefs = useRef<{ [key: string]: HTMLAudioElement | null }>({});

  const languages = [
    { code: 'en', name: 'English (英文)' },
    { code: 'fr', name: 'Français (法文)' },
    { code: 'de', name: 'Deutsch (德文)' },
    { code: 'ja', name: '日本語 (日文)' },
    { code: 'ko', name: '한국어 (韓文)' },
    { code: 'es', name: 'Español (西班牙文)' },
    { code: 'it', name: 'Italiano (義大利文)' },
    { code: 'pt', name: 'Português (葡萄牙文)' },
    { code: 'ru', name: 'Русский (俄文)' },
    { code: 'ar', name: 'العربية (阿拉伯文)' },
    { code: 'hi', name: 'हिन्दी (印地文)' },
    { code: 'th', name: 'ไทย (泰文)' }
  ];

  useEffect(() => {
    // 頁面初始化時，從 firestore 載入所有單字組
    const fetchWordGroups = async () => {
      try {
        const q = query(collection(db, 'ai-lang'), orderBy('createdAt', 'desc'));
        const querySnapshot = await getDocs(q);
        const loadedGroups: WordGroup[] = querySnapshot.docs.map(doc => {
          const data = doc.data();
          return {
            ...data,
            id: doc.id,
            createdAt: data.createdAt ? new Date(data.createdAt.seconds * 1000) : new Date(),
          } as WordGroup;
        });
        setWordGroups(loadedGroups);
      } catch (err) {
        setError('無法從資料庫載入單字組');
        alert('無法從資料庫載入單字組');
        console.error('載入單字組錯誤:', err);
      }
    };
    fetchWordGroups();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!keyword.trim() || !selectedLanguage) {
      setError('請填寫關鍵字並選擇語言');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/word-ai', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          keyword: keyword.trim(),
          selectedLanguage: selectedLanguage,
        }),
      });

      const result: ApiResponse = await response.json();

      if (result.success && result.data) {
        const newWordGroup: WordGroup = {
          id: Date.now().toString(),
          keyword: result.keyword || keyword,
          language: result.language || selectedLanguage,
          languageName: getLanguageName(result.language || selectedLanguage),
          wordData: result.data,
          sentences: {},
          createdAt: new Date(),
        };
        // 儲存到 Firestore
        try {
          await addDoc(collection(db, 'ai-lang'), {
            ...newWordGroup,
            createdAt: new Date(),
          });
        } catch (firestoreErr) {
          alert('儲存到資料庫失敗');
          console.error('儲存到 Firestore 失敗:', firestoreErr);
        }
        // 將新的單字組添加到陣列開頭（新到舊排序）
        setWordGroups(prev => [newWordGroup, ...prev]);
        
        // 清空表單
        setKeyword('');
        setSelectedLanguage('');
      } else {
        setError(result.error || '發生未知錯誤');
      }
    } catch (err) {
      setError('網路連線錯誤，請稍後再試');
      console.error('API 請求錯誤:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const generateSentence = async (word: string, language: string, wordGroupId: string) => {
    const sentenceKey = `${wordGroupId}-${word}`;
    
    // 如果已經有例句，直接返回
    const wordGroup = wordGroups.find(wg => wg.id === wordGroupId);
    if (wordGroup && wordGroup.sentences[word]) {
      return;
    }

    setGeneratingSentences(prev => ({ ...prev, [sentenceKey]: true }));

    try {
      const response = await fetch('/api/sentence-ai', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          word: word,
          language: language,
        }),
      });

      const result: SentenceApiResponse = await response.json();

      if (result.success && result.data) {
        setWordGroups(prev => prev.map(wg => {
          if (wg.id === wordGroupId) {
            return {
              ...wg,
              sentences: {
                ...wg.sentences,
                [word]: result.data!
              }
            };
          }
          return wg;
        }));
      } else {
        console.error('生成例句失敗:', result.error);
      }
    } catch (err) {
      console.error('生成例句API錯誤:', err);
    } finally {
      setGeneratingSentences(prev => ({ ...prev, [sentenceKey]: false }));
    }
  };

  // 播放例句語音
  const handlePlayTTS = async (sentence: string, language: string, sentenceKey: string) => {
    if (playingAudio[sentenceKey]) return;
    setPlayingAudio(prev => ({ ...prev, [sentenceKey]: true }));
    try {
      let audioUrl = audioCache[sentenceKey];
      if (!audioUrl) {
        const res = await fetch('/api/tts-ai', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ input: sentence, language }),
        });
        const data = await res.json();
        if (!data.success || !data.audio) throw new Error(data.error || 'TTS 產生失敗');
        audioUrl = `data:audio/mp3;base64,${data.audio}`;
        setAudioCache(prev => ({ ...prev, [sentenceKey]: audioUrl }));
      }
      // 停止其他正在播放的音訊
      Object.values(audioRefs.current).forEach(a => { try { if (a) { a.pause(); a.currentTime = 0; } } catch {} });
      // 建立新的 audio 播放
      if (!audioRefs.current[sentenceKey]) {
        audioRefs.current[sentenceKey] = new Audio(audioUrl);
        audioRefs.current[sentenceKey]?.addEventListener('ended', () => {
          setPlayingAudio(prev => ({ ...prev, [sentenceKey]: false }));
        });
      } else {
        audioRefs.current[sentenceKey]!.src = audioUrl;
      }
      audioRefs.current[sentenceKey]?.play();
    } catch {
      alert('語音播放失敗');
      setPlayingAudio(prev => ({ ...prev, [sentenceKey]: false }));
    }
  };

  const getLanguageName = (code: string) => {
    const language = languages.find(lang => lang.code === code);
    return language ? language.name.split(' (')[0] : code;
  };

  const formatDateTime = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    
    return `${year}/${month}/${day} ${hours}:${minutes}:${seconds}`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
      <div className="container mx-auto px-4 py-16">
        <div className="max-w-6xl mx-auto">
          {/* 標題區域 */}
          <div className="text-center mb-12">
            <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 via-purple-600 to-indigo-600 bg-clip-text text-transparent mb-4">
              AI 語言學習助手
            </h1>
            <p className="text-gray-600 text-lg">
              輸入關鍵字，讓AI為您提供多語言聯想和學習建議
            </p>
          </div>

          {/* 表單卡片 */}
          <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl border border-white/20 p-8 mb-8">
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* 關鍵字輸入框 */}
              <div>
                <label htmlFor="keyword" className="block text-sm font-medium text-gray-700 mb-2">
                  關鍵字
                </label>
                <input
                  type="text"
                  id="keyword"
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  placeholder="請輸入您想要學習的關鍵字..."
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 bg-white/50 backdrop-blur-sm"
                  required
                  disabled={isLoading}
                />
              </div>

              {/* 語言選擇下拉選單 */}
              <div>
                <label htmlFor="language" className="block text-sm font-medium text-gray-700 mb-2">
                  選擇語言
                </label>
                <select
                  id="language"
                  value={selectedLanguage}
                  onChange={(e) => setSelectedLanguage(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 bg-white/50 backdrop-blur-sm"
                  required
                  disabled={isLoading}
                >
                  <option value="">請選擇語言</option>
                  {languages.map((language) => (
                    <option key={language.code} value={language.code}>
                      {language.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* 送出按鈕 */}
              <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 disabled:from-gray-400 disabled:to-gray-500 text-white font-semibold py-3 px-6 rounded-lg transition-all duration-200 transform hover:scale-105 disabled:transform-none shadow-lg hover:shadow-xl disabled:shadow-md"
              >
                {isLoading ? (
                  <div className="flex items-center justify-center space-x-2">
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span>AI 正在生成單字...</span>
                  </div>
                ) : (
                  '開始AI聯想學習'
                )}
              </button>
            </form>
          </div>

          {/* 錯誤訊息 */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-8">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              </div>
            </div>
          )}

          {/* 單字組卡片區域 */}
          {wordGroups.length > 0 && (
            <div className="space-y-8">
              {/* 標題 */}
              <div className="text-center">
                <h2 className="text-2xl font-bold text-gray-800 mb-2">
                  您的學習記錄
                </h2>
                <p className="text-gray-600">按時間排序，最新的在最上方</p>
              </div>

              {/* 單字組卡片列表 */}
              <div className="space-y-6">
                {wordGroups.map((wordGroup) => (
                  <div
                    key={wordGroup.id}
                    className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-xl border border-white/30 overflow-hidden hover:shadow-2xl transition-all duration-300"
                  >
                    {/* 單字組標題區域 */}
                    <div className="bg-gradient-to-r from-blue-600 via-purple-600 to-indigo-600 text-white p-6">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-2 sm:space-y-0">
                        <div>
                          <h3 className="text-xl font-bold">
                            {wordGroup.keyword} - {wordGroup.languageName} 相關單字
                          </h3>
                          <p className="text-blue-100 text-sm mt-1">
                            生成時間：{formatDateTime(wordGroup.createdAt)}
                          </p>
                        </div>
                        <div className="flex items-center space-x-2">
                          <div className="bg-white/20 rounded-full px-3 py-1 text-sm font-medium">
                            {wordGroup.languageName}
                          </div>
                          <div className="bg-white/20 rounded-full px-3 py-1 text-sm font-medium">
                            {wordGroup.wordData.單字清單.length} 個單字
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* 單字卡片網格 */}
                    <div className="p-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        {wordGroup.wordData.單字清單.map((word, index) => {
                          const sentenceKey = `${wordGroup.id}-${word}`;
                          const isGenerating = generatingSentences[sentenceKey];
                          const hasSentence = !!wordGroup.sentences[word];
                          
                          return (
                            <div
                              key={index}
                              className="bg-gradient-to-br from-blue-50 to-purple-50 border border-blue-200 rounded-xl p-4 hover:shadow-lg transition-all duration-300 transform hover:scale-105"
                            >
                              <div className="text-center space-y-3">
                                {/* 單字 */}
                                <div className="bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-lg p-3">
                                  <h4 className="text-lg font-bold">{word}</h4>
                                </div>
                                
                                {/* 中文意思 */}
                                <div className="text-gray-700">
                                  <p className="text-base font-medium">{wordGroup.wordData.單字中文意思[index]}</p>
                                </div>

                                {/* AI生成例句按鈕 */}
                                <div className="space-y-2">
                                  <button
                                    onClick={() => generateSentence(word, wordGroup.language, wordGroup.id)}
                                    disabled={isGenerating || hasSentence}
                                    className={`w-full py-2 px-3 rounded-lg text-sm font-medium transition-all duration-200 ${
                                      hasSentence
                                        ? 'bg-green-100 text-green-700 cursor-default'
                                        : isGenerating
                                        ? 'bg-gray-100 text-gray-500 cursor-not-allowed'
                                        : 'bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white hover:shadow-md'
                                    }`}
                                  >
                                    {hasSentence ? (
                                      <span className="flex items-center justify-center space-x-1">
                                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                        </svg>
                                        <span>例句已生成</span>
                                      </span>
                                    ) : isGenerating ? (
                                      <span className="flex items-center justify-center space-x-2">
                                        <div className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin"></div>
                                        <span>生成中...</span>
                                      </span>
                                    ) : (
                                      <span className="flex items-center justify-center space-x-1">
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                        </svg>
                                        <span>AI生成例句</span>
                                      </span>
                                    )}
                                  </button>

                                  {/* 例句顯示區域 */}
                                  {hasSentence && (
                                    <div className="bg-white/70 rounded-lg p-3 space-y-2 border border-green-200 relative">
                                      <button
                                        className={`absolute top-2 right-2 flex items-center justify-center rounded-full border border-blue-200 focus:outline-none transition-all duration-200 shadow-md bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300`}
                                        style={{ width: 25.6, height: 25.6, minWidth: 25.6, minHeight: 25.6, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                        disabled={playingAudio[sentenceKey]}
                                        onClick={() => handlePlayTTS(wordGroup.sentences[word].例句, wordGroup.language, sentenceKey)}
                                        aria-label="播放發音"
                                      >
                                        {playingAudio[sentenceKey] ? (
                                          <svg className="w-4 h-4 animate-spin text-white block mx-auto my-auto" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"></path></svg>
                                        ) : (
                                          <svg className="w-5 h-5 text-white block mx-auto my-auto" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                                            <path d="M3 10v4h4l5 5V5l-5 5H3zm13.5 2c0-1.77-1.02-3.29-2.5-4.03v8.06A4.978 4.978 0 0 0 16.5 12zm2.5 0c0 3.04-2.46 5.5-5.5 5.5v2c4.14 0 7.5-3.36 7.5-7.5s-3.36-7.5-7.5-7.5v2c3.04 0 5.5 2.46 5.5 5.5z" />
                                          </svg>
                                        )}
                                      </button>
                                      <div className="text-left">
                                        <p className="text-sm font-medium text-gray-800 mb-1">例句：</p>
                                        <p className="text-sm text-gray-700 italic">&quot;{wordGroup.sentences[word].例句}&quot;</p>
                                      </div>
                                      <div className="text-left">
                                        <p className="text-sm font-medium text-gray-800 mb-1">中文意思：</p>
                                        <p className="text-sm text-gray-600">&quot;{wordGroup.sentences[word].例句中文意思}&quot;</p>
                                      </div>
                                    </div>
                                  )}
                                </div>
                                
                                {/* 學習進度指示器 */}
                                <div className="flex justify-center">
                                  <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse"></div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* 學習提示 */}
                    <div className="bg-blue-50 border-t border-blue-200 p-4">
                      <p className="text-blue-800 text-sm text-center">
                        💡 提示：點擊「AI生成例句」按鈕可以獲得包含該單字的實用例句，幫助您更好地理解單字用法！
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              {/* 清空記錄按鈕 */}
              {wordGroups.length > 1 && (
                <div className="text-center">
                  <button
                    onClick={() => setWordGroups([])}
                    className="bg-red-500 hover:bg-red-600 text-white font-medium py-2 px-6 rounded-lg transition-all duration-200 transform hover:scale-105"
                  >
                    清空所有記錄
                  </button>
                </div>
              )}
            </div>
          )}

          {/* 裝飾元素 */}
          {wordGroups.length === 0 && !isLoading && (
            <div className="mt-12 text-center">
              <div className="inline-flex items-center space-x-2 text-gray-500">
                <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse"></div>
                <span className="text-sm">AI正在等待您的指令</span>
                <div className="w-2 h-2 bg-purple-400 rounded-full animate-pulse"></div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
