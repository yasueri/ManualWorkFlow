// ページ読み込み時の処理を開始
document.addEventListener('DOMContentLoaded', function() {
    // HTMLから埋め込まれたCSVデータを取得
    const csvData = window.csvData || "";
    
    // CSVの安全性を検証する関数
    function validateCsvSafety(csvText) {
        // 基本的な危険パターンのチェック - 難読化対策を強化
        const dangerPatterns = [
            /<\s*s\s*c\s*r\s*i\s*p\s*t/i,       // スクリプトタグ（例: <script>, < s c r i p t>）
            /j\s*a\s*v\s*a\s*s\s*c\s*r\s*i\s*p\s*t\s*:/i, // JavaScriptプロトコル（例: javascript:, j a v a s c r i p t:）
            /d\s*a\s*t\s*a\s*:/i,               // データURL（例: data:, d a t a:）
            /e\s*v\s*a\s*l\s*\(/i,               // eval関数（例: eval(), e v a l (  )）
            /o\s*n\s*\w+\s*=/i,                 // イベントハンドラ属性（例: onclick=, o n click =, onmouseover=）
            /<\s*i\s*f\s*r\s*a\s*m\s*e/i,        // iframeタグ（例: <iframe>, < i f r a m e >）
            /<\s*o\s*b\s*j\s*e\s*c\s*t/i,        // objectタグ（例: <object>, < o b j e c t >）
            /<\s*e\s*m\s*b\s*e\s*d/i,            // embedタグ（例: <embed>, < e m b e d >）
            /d\s*o\s*c\s*u\s*m\s*e\s*n\s*t\s*\./i, // documentオブジェクト操作（例: document., d o c u m e n t .）
            /w\s*i\s*n\s*d\s*o\s*w\s*\./i,        // windowオブジェクト操作（例: window., w i n d o w .）
            /\bl\s*o\s*c\s*a\s*t\s*i\s*o\s*n\b/i, // locationオブジェクト操作（例: location, l o c a t i o n）
            /l\s*o\s*c\s*a\s*l\s*S\s*t\s*o\s*r\s*a\s*g\s*e/i, // ローカルストレージ操作（例: localStorage, l o c a l S t o r a g e）
            /s\s*e\s*s\s*s\s*i\s*o\s*n\s*S\s*t\s*o\s*r\s*a\s*g\s*e/i // セッションストレージ操作（例: sessionStorage, s e s s i o n S t o r a g e）
        ];
        
        // 危険パターンチェック
        for (const pattern of dangerPatterns) {
            if (pattern.test(csvText)) {
                console.warn(`CSVデータに潜在的な危険パターンが見つかりました: ${pattern}`);
                return false;
            }
        }
        
        // データサイズの検証
        if (csvText.length > 5000000) { // 5MBを超える場合（DoS攻撃対策）
            console.warn("CSVデータが大きすぎます: " + (csvText.length / 1000000).toFixed(2) + "MB");
            return false;
        }
        
        return true;
    }

    // CSVパース関数（より厳密なバージョン）
    function parseCSV(csvText) {
        // 事前に安全性を検証
        if (!validateCsvSafety(csvText)) {
            // 安全でない場合は空の配列を返す
            console.error("CSVデータに危険なパターンが含まれているため、処理を中止します。");
            return [];
        }

        const rows = [];
        let currentRow = [];
        let currentField = "";
        let insideQuotes = false;

        for (let i = 0; i < csvText.length; i++) {
            const char = csvText[i];

            if (char === '"') {
                if (insideQuotes && csvText[i + 1] === '"') {
                    currentField += '"';
                    i++;
                } else {
                    insideQuotes = !insideQuotes;
                }
            } else if (char === "," && !insideQuotes) {
                currentRow.push(currentField);
                currentField = "";
            } else if ((char === "\n" || char === "\r") && !insideQuotes) {
                if (char === "\r" && csvText[i + 1] === "\n") {
                    i++;
                }
                currentRow.push(currentField);
                rows.push(currentRow);
                currentRow = [];
                currentField = "";
            } else {
                currentField += char;
            }
        }

        if (currentField || currentRow.length > 0) {
            currentRow.push(currentField);
            rows.push(currentRow);
        }

        return rows;
    }

    // 最大再帰回数を設定
    const MAX_DECODE_RECURSION = 5;

    // HTML実体参照をデコードする関数（例: &lt;script&gt; → <script>）
    function decodeHtmlEntities(input) {
        return input
            .replace(/&amp;/g, '&')      // &amp; → &
            .replace(/&lt;/g, '<')       // &lt; → 
            .replace(/&gt;/g, '>')       // &gt; → >
            .replace(/&quot;/g, '"')     // &quot; → "
            .replace(/&#039;/g, "'")     // &#039; → '
            .replace(/&#39;/g, "'")      // &#39; → '
            // 16進数のHTML実体参照（例: &#x3c; → <）
            .replace(/&#x([0-9a-f]+);/gi, (match, hex) => String.fromCharCode(parseInt(hex, 16)))
            // 10進数のHTML実体参照（例: &#60; → <）
            .replace(/&#(\d+);/g, (match, dec) => String.fromCharCode(dec));
    }

    // 強化されたサニタイズ関数（再帰回数制限付き）
    function enhancedSanitizeInput(input, recursionCount = 0) {
        // 再帰回数チェック
        if (recursionCount >= MAX_DECODE_RECURSION) {
            console.warn("最大再帰回数に達しました。入力に多層の難読化が含まれている可能性があります。");
            return ""; // 安全のため空文字列を返す
        }
        
        // null/undefined チェック
        if (input === null || input === undefined) return "";
        
        // 文字列化
        input = String(input);
        
        // HTML実体参照をデコードして隠れた危険なパターンを検出（例: &lt;script&gt; → <script>）
        const decodedInput = decodeHtmlEntities(input);
        if (decodedInput !== input) {
            // デコードした結果が変わっている場合は再帰的に処理（多層の難読化対策）
            // 再帰呼び出し時にカウンターをインクリメント
            return enhancedSanitizeInput(decodedInput, recursionCount + 1);
        }
        
        // HTML特殊文字のエスケープ
        input = input
            .replace(/&/g, '&amp;')      // & → &amp;
            .replace(/</g, '&lt;')       // < → &lt;
            .replace(/>/g, '&gt;')       // > → &gt;
            .replace(/"/g, '&quot;')     // " → &quot;
            .replace(/'/g, '&#039;');    // ' → &#039;
        
        // スクリプトインジェクション対策（空白による難読化対策を追加）
        input = input
            .replace(/j\s*a\s*v\s*a\s*s\s*c\s*r\s*i\s*p\s*t\s*:/gi, '') // javascript: 対策（空白対応）
            .replace(/d\s*a\s*t\s*a\s*:/gi, '')                         // data: 対策（空白対応）
            .replace(/v\s*b\s*s\s*c\s*r\s*i\s*p\s*t\s*:/gi, '')         // vbscript: 対策（空白対応）
            .replace(/e\s*x\s*p\s*r\s*e\s*s\s*s\s*i\s*o\s*n\s*:/gi, '') // CSS expression: 対策（空白対応）
            .replace(/e\s*v\s*a\s*l\s*\(/gi, '')                        // eval() 対策（空白対応）
            .replace(/p\s*r\s*o\s*m\s*p\s*t\s*\(/gi, '')                // prompt() 対策（空白対応）
            .replace(/a\s*l\s*e\s*r\s*t\s*\(/gi, '');                   // alert() 対策（空白対応）
        
        // イベントハンドラと危険な属性の徹底的な除去（空白対応）
        input = input.replace(/o\s*n\s*\w+\s*=|\w+\s*:\s*u\s*r\s*l\s*\(/gi, ''); // onclick=, on click=, url(, u r l ( 対策
        
        return input;
    }

    // highlight-words.jsファイルの構造を検証する関数
    function validateHighlightWordsFile() {
        // ファイル構造の検証のためのメタデータ
        const expectedFileMetadata = {
            lineCount: 3, // 期待される行数
            firstLinePattern: /^\/\/\s*ハイライト対象の単語を定義するファイル/, // 1行目のパターン
            secondLinePattern: /^\/\/\s*単語をCSV形式で記述し/ // 2行目のパターン
        };
        
        try {
            // この関数は追加のセキュリティレイヤーとして機能
            // 注: CSPの制限によりファイル内容を直接取得することは難しいため、
            // window.highlightWordsCSVの形式と内容の検証に重点を置く
            
            if (typeof window.highlightWordsCSV !== 'string') {
                console.error('highlight-words.js: 期待されるハイライト単語の定義が見つかりません。');
                // 必要に応じてフォールバック処理を実装
                window.highlightWordsCSV = ''; // セキュリティのため空の文字列に設定
            }
        } catch (error) {
            console.error('highlight-words.jsの検証中にエラーが発生しました:', error);
            // セキュリティのため機能を無効化
            window.highlightWordsCSV = '';
        }
    }

    // ハイライトファイルの構造検証を実行
    validateHighlightWordsFile();

    
    // ハイライト対象の単語配列を安全に取得する関数
    function getSecureHighlightWordsArray() {
        try {
            // 1. highlightWordsCSVが定義されているか確認
            if (typeof window.highlightWordsCSV !== 'string') {
                console.warn('ハイライト対象の単語が定義されていません。');
                return [];
            }
            
            // 2. CSVの安全性を検証
            if (!validateCsvSafety(window.highlightWordsCSV)) {
                console.error('ハイライト単語CSVに潜在的な危険パターンが含まれています。処理を中止します。');
                return [];
            }
            
            // 3. 既存のparseCSV関数を活用してCSVをパース (注: 元のscript.jsにある関数を再利用)
            const rows = parseCSV(window.highlightWordsCSV);
            
            // 4. 単語リストを生成
            const words = [];
            for (let i = 0; i < rows.length; i++) {
                const row = rows[i];
                for (let j = 0; j < row.length; j++) {
                    const token = row[j].trim();
                    if (token.length > 0) {
                        // 引用符で囲まれている場合は引用符を削除
                        const cleaned = token.startsWith('"') && token.endsWith('"') 
                            ? token.substring(1, token.length - 1) 
                            : token;
                        
                        if (cleaned.length > 0) {
                            words.push(cleaned);
                        }
                    }
                }
            }
            
            return words;
        } catch (error) {
            console.error('ハイライト対象の単語の処理中にエラーが発生しました:', error);
            return [];
        }
    }

    // 安全なHTML描画関数
    function renderSafeHtml(unsafeContent) {
        if (!unsafeContent) return "";
        
        try {
            // 1. コンテンツをサニタイズ
            const sanitized = enhancedSanitizeInput(unsafeContent);
            
            // 2. 改行のみを特別扱い
            const withLineBreaks = sanitized.replace(/\n/g, "<br>");
            
            // 3. ハイライト対象の単語リストを取得
            const highlightWords = getSecureHighlightWordsArray();
            
            // 4. 単語の長さでソートして長い順に処理（部分一致を防ぐため）
            const sortedWords = [...highlightWords].sort((a, b) => b.length - a.length);
            
            // 5. ハイライト処理の実施
            let result = withLineBreaks;
            
            for (const word of sortedWords) {
                if (!word || word.length === 0) continue; // 空の単語はスキップ
                
                // 単語内の改行を<br>に置換
                const processedWord = word.replace(/\n/g, "<br>");
                
                // 正規表現の特殊文字をエスケープ
                const escapedForRegex = processedWord.replace(/[.*+?^${}()|[\]\\,]/g, '\\$&');
                
                // 正規表現オブジェクトを作成し置換を実行
                const regex = new RegExp(escapedForRegex, 'g');
                if (regex.test(result)) {
                    // 正規表現をリセット
                    regex.lastIndex = 0;
                    
                    // 置換処理
                    result = result.replace(regex, match => 
                        `<span class="csv-text-highlight">${match}</span>`
                    );
                }
            }
            
            return result;
        } catch (error) {
            console.error('HTML描画中にエラーが発生しました:', error);
            // エラー時は安全のためサニタイズだけを適用して返す
            return enhancedSanitizeInput(unsafeContent).replace(/\n/g, "<br>");
        }
    }

    // CSVデータの処理
    let isDataValid = false;
    let csvRows = [];
    let headers = [];
    let data = [];

    try {
        // CSVデータの安全性を検証してからパース
        if (validateCsvSafety(csvData)) {
            csvRows = parseCSV(csvData);
            headers = csvRows[0] ? csvRows[0].map(h => h.trim()) : [];
            const rows = csvRows.slice(1);
            data = rows.map(row => {
                const obj = {};
                headers.forEach((header, index) => {
                    obj[header] = index < row.length ? row[index].trim() : "";
                });
                return obj;
            });
        } else {
            // 安全でない場合は処理を停止
            showValidationResults(
                ["CSVデータに潜在的に危険なコンテンツが含まれています。データを確認してください。"], 
                []
            );
            data = []; // 空のデータを設定
        }
    } catch (error) {
        console.error("CSVデータの処理中にエラーが発生しました:", error);
        data = []; // エラー時は空のデータを設定
        showValidationResults(
            ["CSVデータの処理中にエラーが発生しました: " + error.message], 
            []
        );
    }

    // StepIDの設定に問題がないかチェック
    function validateCsvData(data) {
        const errors = [];
        const warnings = [];
        
        // データが空の場合は検証エラー
        if (!data || data.length === 0) {
            errors.push("CSVデータが空または無効です");
            return { errors, warnings, isValid: false };
        }
        
        // 必須フィールドの存在確認
        const requiredFields = ["StepID", "タイトル"];
        const firstRow = data[0] || {};
        const availableFields = Object.keys(firstRow);
        
        requiredFields.forEach(field => {
            if (!availableFields.includes(field)) {
                errors.push(`必須フィールド "${field}" がCSVデータに存在しません`);
            }
        });
        
        // StepIDの一意性チェック
        const stepIds = {};
        data.forEach((row, index) => {
            if (!row.StepID) return; // 空行はスキップ
            
            if (stepIds[row.StepID]) {
                errors.push(`重複するStepID "${row.StepID}" が行 ${index + 2} で見つかりました`);
            } else {
                stepIds[row.StepID] = true;
            }
        });
        
        // すべてのステップIDを収集して、参照先の存在をチェックできるようにする
        const allStepIds = new Set(data.map(row => row.StepID).filter(id => id));
        
        data.forEach(row => {
            if (!row.StepID) return; // 空行はスキップ
            
            // 次ステップの参照が有効かチェック
            if (row.DefaultNext && !allStepIds.has(row.DefaultNext)) {
                warnings.push(`ステップ ${row.StepID}: 「次へ」ボタンが無効なステップ "${row.DefaultNext}" を指しています`);
            }
            
            // 選択肢の検証
            if (row.Option1Text && !row.Option1Next) {
                errors.push(`ステップ ${row.StepID}: 選択肢「${row.Option1Text}」の次のステップが指定されていません`);
            } else if (row.Option1Next && !allStepIds.has(row.Option1Next)) {
                warnings.push(`ステップ ${row.StepID}: 選択肢「${row.Option1Text}」が無効なステップ "${row.Option1Next}" を指しています`);
            }
            
            // 選択肢2の検証
            if (row.Option2Text && !row.Option2Next) {
                errors.push(`ステップ ${row.StepID}: 選択肢「${row.Option2Text}」の次のステップが指定されていません`);
            } else if (row.Option2Next && !allStepIds.has(row.Option2Next)) {
                warnings.push(`ステップ ${row.StepID}: 選択肢「${row.Option2Text}」が無効なステップ "${row.Option2Next}" を指しています`);
            }
            
            // 選択肢3の検証
            if (row.Option3Text && !row.Option3Next) {
                errors.push(`ステップ ${row.StepID}: 選択肢「${row.Option3Text}」の次のステップが指定されていません`);
            } else if (row.Option3Next && !allStepIds.has(row.Option3Next)) {
                warnings.push(`ステップ ${row.StepID}: 選択肢「${row.Option3Text}」が無効なステップ "${row.Option3Next}" を指しています`);
            }
            
            // 選択肢4の検証
            if (row.Option4Text && !row.Option4Next) {
                errors.push(`ステップ ${row.StepID}: 選択肢「${row.Option4Text}」の次のステップが指定されていません`);
            } else if (row.Option4Next && !allStepIds.has(row.Option4Next)) {
                warnings.push(`ステップ ${row.StepID}: 選択肢「${row.Option4Text}」が無効なステップ "${row.Option4Next}" を指しています`);
            }
            
            // 選択肢5の検証
            if (row.Option5Text && !row.Option5Next) {
                errors.push(`ステップ ${row.StepID}: 選択肢「${row.Option5Text}」の次のステップが指定されていません`);
            } else if (row.Option5Next && !allStepIds.has(row.Option5Next)) {
                warnings.push(`ステップ ${row.StepID}: 選択肢「${row.Option5Text}」が無効なステップ "${row.Option5Next}" を指しています`);
            }
        });
        
        // ユーザーフレンドリーなポップアップで通知
        showValidationResults(errors, warnings);
        
        return { 
            errors, 
            warnings, 
            isValid: errors.length === 0 
        };
    }
    
    // ポップアップ表示関数（StepIDの設定に問題があった時のために）
    function showValidationResults(errors, warnings) {
        // エラーや警告がなければ何もしない
        if (errors.length === 0 && warnings.length === 0) return;
        
        // ポップアップのHTML要素を作成
        const popupOverlay = document.createElement('div');
        popupOverlay.className = 'validation-popup-overlay';
        
        const popupBox = document.createElement('div');
        popupBox.className = 'validation-popup-box';
        
        const title = document.createElement('h2');
        title.className = 'validation-popup-title';
        title.textContent = errors.length > 0 ? 'CSVデータにエラーがあります' : '警告';
        
        const messageArea = document.createElement('div');
        messageArea.className = 'message-area';
        
        // エラーの表示
        if (errors.length > 0) {
            const errorsList = document.createElement('div');
            const errorTitle = document.createElement('p');
            errorTitle.className = 'error-title';
            errorTitle.textContent = "次のエラーを修正してください:";
            errorsList.appendChild(errorTitle);
            
            const ul = document.createElement('ul');
            ul.className = 'error-list';
            
            errors.forEach(err => {
                const li = document.createElement('li');
                li.textContent = err; // textContentを使用して安全に設定
                ul.appendChild(li);
            });
            
            errorsList.appendChild(ul);
            messageArea.appendChild(errorsList);
        }
        
        // 警告の表示
        if (warnings.length > 0) {
            const warningsList = document.createElement('div');
            const warningTitle = document.createElement('p');
            warningTitle.className = 'warning-title';
            warningTitle.textContent = "注意事項:";
            warningsList.appendChild(warningTitle);
            
            const ul = document.createElement('ul');
            ul.className = 'warning-list';
            
            warnings.forEach(warn => {
                const li = document.createElement('li');
                li.textContent = warn; // textContentを使用して安全に設定
                ul.appendChild(li);
            });
            
            warningsList.appendChild(ul);
            messageArea.appendChild(warningsList);
        }
        
        // 閉じるボタン
        const buttonContainer = document.createElement('div');
        buttonContainer.className = 'button-container';
        
        const closeButton = document.createElement('button');
        closeButton.textContent = '閉じる';
        closeButton.className = 'close-button';
        closeButton.addEventListener('click', () => {
            document.body.removeChild(popupOverlay);
        });
        
        buttonContainer.appendChild(closeButton);
        
        // ポップアップの組み立て
        popupBox.appendChild(title);
        popupBox.appendChild(messageArea);
        popupBox.appendChild(buttonContainer);
        popupOverlay.appendChild(popupBox);
        
        // ポップアップを表示
        document.body.appendChild(popupOverlay);
        
        // コンソールにも記録
        if (errors.length > 0) {
            console.error("CSVデータにエラーがあります:", errors);
        }
        if (warnings.length > 0) {
            console.warn("CSVデータに警告があります:", warnings);
        }
    }

    // 実際に検証を実行
    const validationResult = validateCsvData(data);
    isDataValid = validationResult.isValid;

    // ステップデータの構造化（エラーがなければ処理を続行）
    const stepsData = {};
    if (isDataValid) {
        try {
            data.forEach(row => {
                if (!row.StepID) return; // 空行をスキップ
                
                const id = row.StepID;
                const title = row.タイトル;
                
                // 説明を個別に保持する構造に変更
                const explanations = {
                    exp1: row.説明１ || "",
                    nota: row.補足説明１ || "", // 補足説明１
                    exp2: row.説明２ || "",
                    exp3: row.説明３ || ""
                };

                const options = [];
                if (row.Option1Text && row.Option1Next) {
                    options.push({
                        text: row.Option1Text,
                        next: row.Option1Next
                    });
                }
                if (row.Option2Text && row.Option2Next) {
                    options.push({
                        text: row.Option2Text,
                        next: row.Option2Next
                    });
                }
                if (row.Option3Text && row.Option3Next) {
                    options.push({
                        text: row.Option3Text,
                        next: row.Option3Next
                    });
                }
                if (row.Option4Text && row.Option4Next) {
                    options.push({
                        text: row.Option4Text,
                        next: row.Option4Next
                    });
                }
                if (row.Option5Text && row.Option5Next) {
                    options.push({
                        text: row.Option5Text,
                        next: row.Option5Next
                    });
                }

                const defaultNext = row.DefaultNext || "";
                
                // NonAutoSelect フラグを取得 - 明示的に "1" または "true" の場合のみ自動選択を無効にする
                const nonAutoSelectValue = row.NonAutoSelect ? row.NonAutoSelect.trim() : "";
                const nonAutoSelect = nonAutoSelectValue === "1" || nonAutoSelectValue.toLowerCase() === "true";
                
                stepsData[id] = { 
                    id, 
                    title, 
                    explanations, // 説明を構造化して保存
                    options, 
                    defaultNext,
                    // 自動選択が有効かどうかのフラグ（NonAutoSelectが1または真の場合は無効）
                    nonAutoSelect: nonAutoSelect
                };
            });
        } catch (error) {
            console.error("ステップデータの構造化中にエラーが発生しました:", error);
            showValidationResults(
                ["ステップデータの処理中にエラーが発生しました: " + error.message], 
                []
            );
            isDataValid = false;
        }
    }

    // データが無効な場合、最低限の初期データを設定
    if (!isDataValid || Object.keys(stepsData).length === 0) {
        console.warn("エラーがあるためステップデータの構造化をスキップしました");
        stepsData["1"] = {
            id: "1",
            title: "エラー",
            explanations: {
                exp1: "CSVデータにエラーがあります。修正してからやり直してください。",
                nota: "",
                exp2: "",
                exp3: ""
            },
            options: [],
            defaultNext: "",
            nonAutoSelect: false
        };
    }

    // フロー履歴の管理
    let storyHistory = [];
    // 選択肢と選択内容のマッピングを保存するオブジェクト
    let optionSelectionHistory = {};
    // シーケンス番号のカウンター
    let sequenceCounter = 0;

    // スタイリング適用関数の改善 - セキュリティ対策を強化
    function styleDesc(text) {
        return renderSafeHtml(text);
    }

    // 現在のセクションへスクロール
    function scrollToCurrent() {
        const sections = document.querySelectorAll(".story-section");
        if (sections.length > 0) {
            sections[sections.length - 1].scrollIntoView({
                behavior: "smooth",
                block: "center"
            });
        }
    }

    // 選択肢テキストに基づく履歴キーを作成（StepIDは含めない）
    function createOptionsTextKey(options) {
        // 選択肢のテキストのみに基づいてキーを作成
        return options.map(opt => opt.text).sort().join('||');
    }

    // 履歴の初期化関数
    function clearHistoryAfterIndex(index) {
        // 指定されたインデックスまでの履歴を保持し、それ以降をクリア
        storyHistory = storyHistory.slice(0, index + 1);
        
        // シーケンスカウンターを更新
        // 現在の履歴の最後のシーケンスID+1にセット
        if (storyHistory.length > 0 && storyHistory[storyHistory.length - 1].sequenceId !== undefined) {
            sequenceCounter = storyHistory[storyHistory.length - 1].sequenceId + 1;
        } else {
            sequenceCounter = storyHistory.length; // フォールバック
        }
        
        // 自動選択履歴の初期化
        optionSelectionHistory = {};
        
        // 現在までの選択を新しい履歴に登録
        storyHistory.forEach((entry, idx) => {
            if (entry.chosenOption && stepsData[entry.stepId]) {
                const step = stepsData[entry.stepId];
                if (!step.nonAutoSelect && step.options.length > 0) {
                    const optionsTextKey = createOptionsTextKey(step.options);
                    optionSelectionHistory[optionsTextKey] = entry.chosenOption;
                }
            }
        });
    }

    // 確認ポップアップ表示
    function showConfirmation(index, optionText, targetStep) {
        const overlay = document.getElementById("popup-overlay");
        overlay.style.display = "flex";

        const yesBtn = document.getElementById("popup-yes");
        const noBtn = document.getElementById("popup-no");

        yesBtn.onclick = () => {
            // 修正: 先に選択を更新してから履歴を初期化
            // 理由: clearHistoryAfterIndex内で自動選択履歴が再構築される際に、
            // 最新の選択が反映されるようにするため
            storyHistory[index].chosenOption = optionText;
            
            // 履歴を初期化（インデックスまで保持、以降をクリア＆自動選択履歴を再構築）
            clearHistoryAfterIndex(index);
            
            // 次のステップを追加
            if (stepsData[targetStep]) {
                storyHistory.push({ 
                    stepId: targetStep, 
                    chosenOption: null,
                    sequenceId: sequenceCounter++
                });
            }
            
            hidePopup();
            renderFlow();
            scrollToCurrent();
        };

        noBtn.onclick = hidePopup;
    }

    // ポップアップを非表示
    function hidePopup() {
        const overlay = document.getElementById("popup-overlay");
        overlay.style.display = "none";
    }

    // 警告ポップアップ表示
    function showWarningPopup() {
        const overlay = document.getElementById("warning-popup-overlay");
        overlay.style.display = "flex";
        
        const okBtn = document.getElementById("warning-popup-ok");
        okBtn.onclick = hideWarningPopup;
    }

    // 警告ポップアップを非表示
    function hideWarningPopup() {
        const overlay = document.getElementById("warning-popup-overlay");
        overlay.style.display = "none";
    }

    // フローのレンダリング - セキュリティ対策強化
    function renderFlow() {
        const container = document.getElementById("story-container");
        
        // 安全にコンテナをクリア
        while (container.firstChild) {
            container.removeChild(container.firstChild);
        }

        try {
            storyHistory.forEach((entry, index) => {
                const step = stepsData[entry.stepId];
                if (!step) {
                    console.error(`StepID ${entry.stepId} not found in stepsData`);
                    return;
                }
                
                const section = document.createElement("div");
                section.classList.add("story-section");
                section.classList.add(
                    index === storyHistory.length - 1 ? "current" : "past"
                );

                if (step.title) {
                    const titleDiv = document.createElement("div");
                    titleDiv.className = "story-title";
                    titleDiv.innerHTML = styleDesc(step.title);
                    section.appendChild(titleDiv);
                }

                // 説明１を表示
                if (step.explanations.exp1) {
                    const desc1Div = document.createElement("div");
                    desc1Div.className = "story-desc";
                    desc1Div.innerHTML = styleDesc(step.explanations.exp1);
                    section.appendChild(desc1Div);
                }
                
                // 補足説明１（チェックボックス）を表示
                if (step.explanations.nota) {
                    const notaDiv = document.createElement("div");
                    notaDiv.className = "story-nota";
                    
                    // 改行で分割してチェックボックスリストを作成
                    const notaLines = step.explanations.nota.split('\n');
                    let checkboxHtml = '';
                    
                    notaLines.forEach((line, lineIndex) => {
                        if (line.trim()) { // 空行でなければチェックボックスを追加
                            checkboxHtml += `<div class="checkbox-item">
                                <input type="checkbox" id="nota-check-${entry.sequenceId}-${lineIndex}" class="nota-checkbox">
                                <label for="nota-check-${entry.sequenceId}-${lineIndex}">${renderSafeHtml(line)}</label>
                            </div>`;
                        } else {
                            // 空行の場合は、チェックボックスなしの空のdivを追加
                            checkboxHtml += `<div class="empty-line"></div>`;
                        }
                    });
                    
                    notaDiv.innerHTML = checkboxHtml;
                    section.appendChild(notaDiv);
                }
                
                // 説明２と説明３を表示（順番を維持）
                if (step.explanations.exp2 || step.explanations.exp3) {
                    const additionalDescDiv = document.createElement("div");
                    additionalDescDiv.className = "story-desc"; // additional-descクラスを削除
                    
                    let additionalDesc = "";
                    if (step.explanations.exp2) additionalDesc += step.explanations.exp2;
                    if (step.explanations.exp3) {
                        if (additionalDesc) additionalDesc += "\n";
                        additionalDesc += step.explanations.exp3;
                    }
                    
                    additionalDescDiv.innerHTML = styleDesc(additionalDesc);
                    section.appendChild(additionalDescDiv);
                }

                // 自動選択メッセージの表示
                if (entry.autoSelected) {
                    const autoSelectMessage = document.createElement("div");
                    autoSelectMessage.className = "auto-select-message";
                    autoSelectMessage.textContent = "※前回と同じ選択肢が自動選択されました";
                    section.appendChild(autoSelectMessage);
                }

                const optionsDiv = document.createElement("div");
                optionsDiv.className = "option-container";

                // 最後のステップで、かつ選択肢がある場合の処理
                if (index === storyHistory.length - 1 && step.options.length > 0) {
                    // 自動選択が有効な場合のみ処理（nonAutoSelectが無効の場合）
                    if (!step.nonAutoSelect) {
                        // 選択肢のテキストのみに基づいてキーを作成
                        const optionsTextKey = createOptionsTextKey(step.options);
                        
                        // この選択肢のテキスト組み合わせが過去にあり、かつまだ選択が行われていない場合
                        if (optionSelectionHistory[optionsTextKey] && !entry.chosenOption) {
                            // 過去の選択を取得
                            const pastChoice = optionSelectionHistory[optionsTextKey];
                            
                            // 対応する選択肢とターゲットステップを検索
                            const matchedOption = step.options.find(option => option.text === pastChoice);
                            
                            if (matchedOption) {
                                // 自動選択のメッセージを表示
                                const autoSelectMessage = document.createElement("div");
                                autoSelectMessage.className = "auto-select-message";
                                autoSelectMessage.textContent = "※前回と同じ選択肢が自動選択されました";
                                section.appendChild(autoSelectMessage);
                                
                                // 自動的に選択を適用
                                entry.chosenOption = pastChoice;
                                entry.autoSelected = true;
                                
                                // 次のステップに進む（遅延を設定して画面表示後に実行）
                                setTimeout(() => {
                                    if (stepsData[matchedOption.next]) {
                                        storyHistory.push({ 
                                            stepId: matchedOption.next, 
                                            chosenOption: null,
                                            sequenceId: sequenceCounter++
                                        });
                                        renderFlow();
                                        scrollToCurrent();
                                    }
                                }, 1500); // 1.5秒後に次に進む
                            }
                        }
                    }
                }

                if (step.options.length > 0) {
                    step.options.forEach(option => {
                        const btn = document.createElement("button");
                        btn.className = "option-button";
                        // 選択肢テキストもsanitizeInputを使用してサニタイズ
                        btn.innerHTML = styleDesc(option.text);

                        if (entry.chosenOption === option.text) {
                            btn.classList.add("selected");
                        }

                        // 自動選択されたステップの場合のみ変更不可に
                        if (entry.autoSelected) {
                            // 選択肢が選択済みの場合、クリックすると警告を表示
                            btn.onclick = () => {
                                showWarningPopup();
                            };
                            // 視覚的に変更不可であることを示す
                            btn.classList.add("button-disabled");
                        } else if (index < storyHistory.length - 1) {
                            btn.onclick = () => {
                                showConfirmation(index, option.text, option.next);
                            };
                        } else {
                            btn.onclick = () => {
                                // 現在のステップで選択を更新
                                storyHistory[index].chosenOption = option.text;
                                
                                // 選択肢のテキストベースで履歴を記録（nonAutoSelectが無効=自動選択が有効な場合のみ）
                                if (!step.nonAutoSelect) {
                                    const optionsTextKey = createOptionsTextKey(step.options);
                                    optionSelectionHistory[optionsTextKey] = option.text;
                                }
                                
                                // 次のステップへ進む
                                if (stepsData[option.next]) {
                                    storyHistory.push({ 
                                        stepId: option.next, 
                                        chosenOption: null,
                                        sequenceId: sequenceCounter++
                                    });
                                }
                                renderFlow();
                                scrollToCurrent();
                            };
                        }

                        optionsDiv.appendChild(btn);
                    });
                } else if (step.defaultNext) {
                    const btn = document.createElement("button");
                    btn.className = "next-button";
                    btn.textContent = "次へ";

                    // 自動選択されたステップの場合のみ変更不可に
                    if (entry.autoSelected) {
                        // 選択肢が選択済みの場合、クリックすると警告を表示
                        btn.onclick = () => {
                            showWarningPopup();
                        };
                        // 視覚的に変更不可であることを示す
                        btn.classList.add("button-disabled");
                    } else if (index < storyHistory.length - 1) {
                        btn.onclick = () => {
                            showConfirmation(index, "次へ", step.defaultNext);
                        };
                    } else {
                        btn.onclick = () => {
                            // 現在のステップで選択を更新
                            storyHistory[index].chosenOption = "次へ";
                            
                            // 次のステップへ進む
                            if (stepsData[step.defaultNext]) {
                                storyHistory.push({ 
                                    stepId: step.defaultNext, 
                                    chosenOption: null,
                                    sequenceId: sequenceCounter++
                                });
                            }
                            renderFlow();
                            scrollToCurrent();
                        };
                    }

                    optionsDiv.appendChild(btn);
                }

                section.appendChild(optionsDiv);
                container.appendChild(section);
            });

            scrollToCurrent();
        } catch (error) {
            console.error("レンダリング中にエラーが発生しました:", error);
            showValidationResults(
                ["画面表示中にエラーが発生しました: " + error.message], 
                []
            );
        }
    }

    // 初期化と各種イベントハンドラの設定
    function init() {
        try {
            // 最初のステップを設定（シーケンス番号を追加）
            sequenceCounter = 0;
            storyHistory.push({ 
                stepId: "1", 
                chosenOption: null,
                sequenceId: sequenceCounter++
            });
            renderFlow();

            // 安全なイベントハンドラ設定
            function setEventHandler(elementId, eventType, handler) {
                const element = document.getElementById(elementId);
                if (element) {
                    element.addEventListener(eventType, handler);
                } else {
                    console.warn(`Element with ID "${elementId}" not found for event binding`);
                }
            }

            // ページ上部へ戻るボタン
            setEventHandler("scroll-top-button", "click", () => {
                window.scrollTo({ top: 0, behavior: "smooth" });
            });

            // トップページへ戻るボタン
            setEventHandler("top-page-button", "click", () => {
                window.location.href = "../index.html";
            });

            // 警告ポップアップの閉じるボタン
            setEventHandler("warning-popup-ok", "click", hideWarningPopup);

            // ドロップダウンメニューの表示・非表示とフローティングレジェンドの連動
            const headerMenu = document.querySelector(".header-menu");
            const dropdownMenu = document.getElementById("dropdown-menu");
            const menuLegend = document.getElementById("menu-legend");

            if (headerMenu && dropdownMenu) {
                headerMenu.addEventListener("click", (e) => {
                    e.stopPropagation();
                    const isMenuVisible = dropdownMenu.style.display === "block";
                    dropdownMenu.style.display = isMenuVisible ? "none" : "block";
                    
                    // メニューレジェンドの表示/非表示を切り替え
                    if (menuLegend) {
                        menuLegend.style.display = isMenuVisible ? "none" : "block";
                    }
                });

                // ドロップダウンメニュー自体のクリックイベントを阻止
                dropdownMenu.addEventListener("click", (e) => {
                    e.stopPropagation();
                });

                // ドキュメント全体をクリックしたらドロップダウンとレジェンドを閉じる
                document.addEventListener("click", (e) => {
                    if (dropdownMenu.style.display === "block" && 
                        !dropdownMenu.contains(e.target) && 
                        !headerMenu.contains(e.target) && 
                        !menuLegend.contains(e.target)) {
                        dropdownMenu.style.display = "none";
                        
                        // メニューレジェンドも非表示にする
                        if (menuLegend) {
                            menuLegend.style.display = "none";
                        }
                    }
                });

                // フローティングレジェンドのドラッグ機能
                if (menuLegend) {
                    const legendHeader = menuLegend.querySelector('.menu-legend-header');
                    const closeButton = menuLegend.querySelector('.menu-legend-close');
                    
                    if (legendHeader && closeButton) {
                        let isDragging = false;
                        let offsetX, offsetY;
                        
                        // ドラッグ開始
                        legendHeader.addEventListener('mousedown', (e) => {
                            if (e.target === closeButton) return; // 閉じるボタンクリック時は無視
                            
                            isDragging = true;
                            menuLegend.classList.add('dragging');
                            offsetX = e.clientX - menuLegend.getBoundingClientRect().left;
                            offsetY = e.clientY - menuLegend.getBoundingClientRect().top;
                            
                            e.preventDefault();
                        });
                        
                        // ドラッグ中
                        document.addEventListener('mousemove', (e) => {
                            if (!isDragging) return;
                            
                            const x = Math.max(0, Math.min(e.clientX - offsetX, window.innerWidth - menuLegend.offsetWidth));
                            const y = Math.max(0, Math.min(e.clientY - offsetY, window.innerHeight - menuLegend.offsetHeight));
                            
                            menuLegend.classList.add('menu-legend-position');
                            menuLegend.style.setProperty('--legend-left', `${x}px`);
                            menuLegend.style.setProperty('--legend-top', `${y}px`);
                        });
                        
                        // ドラッグ終了
                        document.addEventListener('mouseup', () => {
                            if (isDragging) {
                                isDragging = false;
                                menuLegend.classList.remove('dragging');
                            }
                        });
                        
                        // 閉じるボタン
                        closeButton.addEventListener('click', () => {
                            menuLegend.style.display = 'none';
                        });
                    }
                }
            }

            // ドロップダウンアイテムのクリックイベント
            const dropdownItems = document.querySelectorAll(".dropdown-item:not(.has-submenu)");
            dropdownItems.forEach((item) => {
                item.addEventListener("click", (e) => {
                    e.stopPropagation(); // イベント伝播を防止
                    
                    // データ属性から安全にステップIDを取得
                    const stepId = item.getAttribute("data-step");
                    
                    // 有効なステップIDのみを受け入れる厳格な検証
                    if (stepId && /^[a-zA-Z0-9_-]+$/.test(stepId) && stepsData[stepId]) {
                        // 履歴を完全にクリアして新しく開始
                        storyHistory = [];
                        optionSelectionHistory = {}; // 自動選択履歴もクリア
                        sequenceCounter = 0; // シーケンスカウンターもリセット
                        storyHistory.push({ 
                            stepId: stepId, 
                            chosenOption: null,
                            sequenceId: sequenceCounter++
                        });
                        renderFlow();
                    } else {
                        console.warn(`Invalid or non-existent stepId: ${stepId}`);
                    }
                });
            });

            // サブメニューアイテムのクリックイベント
            const submenuItems = document.querySelectorAll(".submenu-item");
            submenuItems.forEach((item) => {
                item.addEventListener("click", (e) => {
                    e.stopPropagation(); // 親要素へのイベント伝播を防止
                    
                    // データ属性から安全にステップIDを取得
                    const stepId = item.getAttribute("data-step");
                    
                    // 有効なステップIDのみを受け入れる検証
                    if (stepId && /^[a-zA-Z0-9_-]+$/.test(stepId) && stepsData[stepId]) {
                        // 履歴を完全にクリアして新しく開始
                        storyHistory = [];
                        optionSelectionHistory = {}; // 自動選択履歴もクリア
                        sequenceCounter = 0; // シーケンスカウンターもリセット
                        storyHistory.push({ 
                            stepId: stepId, 
                            chosenOption: null,
                            sequenceId: sequenceCounter++
                        });
                        renderFlow();
                    } else {
                        console.warn(`Invalid or non-existent stepId: ${stepId}`);
                    }
                });
            });

            // サブメニューを持つドロップダウンアイテムのクリックイベント
            const hasSubmenuItems = document.querySelectorAll(".dropdown-item.has-submenu");
            hasSubmenuItems.forEach((item) => {
                // クリックイベントを防止（そのままでは親メニュークリックで閉じてしまうため）
                item.addEventListener("click", (e) => {
                    e.stopPropagation();
                });
            });
        } catch (error) {
            console.error("初期化処理中にエラーが発生しました:", error);
            showValidationResults(
                ["アプリケーションの初期化中にエラーが発生しました: " + error.message], 
                []
            );
        }
    }

    // 初期化実行
    init();
});