/**
 * テンキー操作を管理するためのモジュール
 * 業務フローナビゲーションシステム用
 * セキュリティ強化版
 */
(function() {
    'use strict';
    
    // プライベートスコープでクラスを定義（グローバル公開を制限）
    class KeyboardManager {
        constructor(config = {}) {
            // 定数
            this.FOCUS_TYPES = Object.freeze({
                STORY: 'story',
                DROPDOWN: 'dropdown',
                SUBMENU: 'submenu',
                POPUP: 'popup',
                WARNING: 'warning'
            });
            
            // 設定（デフォルト値とマージ）
            this.config = Object.freeze(Object.assign({
                transitionDelay: 150,
                focusDelay: 100,
                styleId: 'keyboard-manager-styles',
                // ターゲット要素（オプションでコンテナを限定できる）
                targetElement: document,
                // 無効化するクラス名（このクラスが付いた要素内ではキー操作を無効化）
                disabledClassName: 'keyboard-manager-disabled'
            }, config));
            
            // キーマップの定義（Object.freezeで不変にする）
            this.KEY_MAPS = Object.freeze({
                UP: Object.freeze(['8', 'ArrowUp']),
                DOWN: Object.freeze(['5', 'ArrowDown']),
                LEFT: Object.freeze(['4', 'ArrowLeft']),
                RIGHT: Object.freeze(['6', 'ArrowRight']),
                SELECT: Object.freeze(['Enter', ' ']),
                MENU: Object.freeze(['7']),
                TOP: Object.freeze(['*']),
                HOME: Object.freeze(['-']),
                OPTION_1: Object.freeze(['1', 'y']),
                OPTION_2: Object.freeze(['2']),
                OPTION_3: Object.freeze(['3', 'n']),
                CANCEL: Object.freeze(['Escape'])
            });
            
            // 安全なバインディングを使用
            this.boundHandleKeyPress = this.handleKeyPress.bind(this);
            
            // キーボードイベントリスナーの設定
            this.setupKeyboardListeners();
            
            // フォーカス状態の管理
            this.currentFocus = {
                type: this.FOCUS_TYPES.STORY,
                index: 0,
                parentIndex: -1,
                submenuName: '',
            };
            
            // ポップアップのフォーカス状態 (0: なし, 1: はい, 2: いいえ)
            this.popupFocusButton = 0;
            
            // フォーカス状態の履歴（ポップアップの「いいえ」ボタン対応用）
            this.previousFocusElement = null;
            this.previousFocusType = this.FOCUS_TYPES.STORY;
            
            // ドロップダウンメニューの表示状態
            this.isDropdownVisible = false;
            
            // 入力処理中フラグ
            this.isProcessingInput = false;
            
            // フォーカス表示用のスタイルを追加
            this.addFocusStyles();
            
            // DOMが準備できたらポップアップの監視を開始
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', () => {
                    this.setupPopupObservers();
                    this.setupUIInteractions();
                });
            } else {
                this.setupPopupObservers();
                this.setupUIInteractions();
            }
            
            // 有効/無効状態
            this.isEnabled = true;
        }

        /**
         * キーボードリスナーのセットアップ
         */
        setupKeyboardListeners() {
            // イベントリスナーをターゲット要素に追加
            this.config.targetElement.addEventListener('keydown', this.boundHandleKeyPress);
        }
        
        /**
         * キーボードマネージャの無効化
         */
        disable() {
            if (this.isEnabled) {
                this.config.targetElement.removeEventListener('keydown', this.boundHandleKeyPress);
                this.isEnabled = false;
            }
        }
        
        /**
         * キーボードマネージャの有効化
         */
        enable() {
            if (!this.isEnabled) {
                this.config.targetElement.addEventListener('keydown', this.boundHandleKeyPress);
                this.isEnabled = true;
            }
        }
        
        /**
         * キーボードマネージャの破棄
         */
        destroy() {
            // リスナーを削除
            this.disable();
            
            // MutationObserverを切断
            if (this.popupObserver) {
                this.popupObserver.disconnect();
            }
            if (this.warningObserver) {
                this.warningObserver.disconnect();
            }
            
            // スタイル要素を削除
            const styleElement = document.getElementById(this.config.styleId);
            if (styleElement) {
                styleElement.remove();
            }
        }

        /**
         * キー配列に指定されたキーが含まれているか確認（安全な実装）
         * @param {string} key 確認するキー
         * @param {Array} keyArray キー配列
         * @returns {boolean} 含まれていればtrue
         */
        isKey(key, keyArray) {
            // nullやundefinedのチェック
            if (!key || !keyArray || !Array.isArray(keyArray)) {
                return false;
            }
            return keyArray.includes(key);
        }

        /**
         * UI要素とのインタラクションをセットアップ
         */
        setupUIInteractions() {
            try {
                // ポップアップボタンのマウスオーバーイベント
                this.setupPopupButtonEvents('popup-yes', 1);
                this.setupPopupButtonEvents('popup-no', 2);
                
                // 警告ポップアップの「了解」ボタンのイベント
                this.setupButtonEvent('warning-popup-ok', () => this.handleWarningOkClick());
            } catch (error) {
                console.error('UI要素の初期化中にエラーが発生しました:', error);
            }
        }

        /**
         * ボタンイベントのセットアップ（安全な実装）
         * @param {string} buttonId ボタンのID
         * @param {Function} callback クリック時のコールバック
         */
        setupButtonEvent(buttonId, callback) {
            // IDのバリデーション（単純な非nullチェック）
            if (!buttonId || typeof buttonId !== 'string') {
                return;
            }
            
            const button = document.getElementById(this.sanitizeId(buttonId));
            if (button && typeof callback === 'function') {
                button.addEventListener('click', callback);
            }
        }

        /**
         * ポップアップボタンのイベントをセットアップ（安全な実装）
         * @param {string} buttonId ボタンのID
         * @param {number} focusIndex フォーカスインデックス
         */
        setupPopupButtonEvents(buttonId, focusIndex) {
            // IDのバリデーション
            if (!buttonId || typeof buttonId !== 'string') {
                return;
            }
            
            const button = document.getElementById(this.sanitizeId(buttonId));
            if (button) {
                button.addEventListener('mouseover', () => this.setPopupFocus(focusIndex));
            }
        }

        /**
         * 警告OKボタンクリック時の処理
         */
        handleWarningOkClick() {
            if (!this.isProcessingInput) {
                this.isProcessingInput = true;
                this.currentFocus.type = this.FOCUS_TYPES.STORY;
                
                setTimeout(() => {
                    this.updateFocus();
                    this.isProcessingInput = false;
                }, this.config.transitionDelay);
            }
        }

        /**
         * ポップアップの表示状態を監視するためのオブザーバーを設定
         */
        setupPopupObservers() {
            try {
                this.setupNormalPopupObserver();
                this.setupWarningPopupObserver();
            } catch (error) {
                console.error('ポップアップオブザーバーの設定中にエラーが発生しました:', error);
            }
        }

        /**
         * 通常ポップアップのオブザーバーをセットアップ
         */
        setupNormalPopupObserver() {
            const popupOverlay = document.getElementById('popup-overlay');
            if (!popupOverlay) {
                console.warn('Popup overlay element not found');
                return;
            }
            
            this.popupObserver = new MutationObserver((mutations) => {
                mutations.forEach((mutation) => {
                    if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
                        if (popupOverlay.style.display === 'flex') {
                            this.handlePopupShown();
                        } else if (popupOverlay.style.display === 'none') {
                            this.handlePopupHidden();
                        }
                    }
                });
            });
            
            this.popupObserver.observe(popupOverlay, { attributes: true });
        }

        /**
         * 警告ポップアップのオブザーバーをセットアップ
         */
        setupWarningPopupObserver() {
            const warningPopup = document.getElementById('warning-popup-overlay');
            if (!warningPopup) return;
            
            this.warningObserver = new MutationObserver((mutations) => {
                mutations.forEach((mutation) => {
                    if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
                        if (warningPopup.style.display === 'flex') {
                            this.handleWarningPopupShown();
                        } else if (warningPopup.style.display === 'none' || warningPopup.style.display === '') {
                            this.handleWarningPopupHidden();
                        }
                    }
                });
            });
            
            this.warningObserver.observe(warningPopup, { attributes: true });
        }

        /**
         * ポップアップが表示された時の処理
         */
        handlePopupShown() {
            // ポップアップが表示される前のフォーカス状態を保存
            const focusedElement = document.querySelector('.keyboard-focus');
            if (focusedElement) {
                this.previousFocusElement = focusedElement;
                this.previousFocusType = this.currentFocus.type;
            }
            
            // ポップアップが表示された時のフォーカス設定
            this.currentFocus.type = this.FOCUS_TYPES.POPUP;
            
            // 少し遅延させてフォーカスを設定
            setTimeout(() => {
                this.resetPopupFocus();
                this.setPopupFocus(1); // 「はい」ボタンに自動フォーカス
            }, this.config.focusDelay);
        }

        /**
         * ポップアップが非表示になった時の処理
         */
        handlePopupHidden() {
            if (this.popupFocusButton === 2 && this.previousFocusElement) {
                // "いいえ"ボタンで閉じられた場合は以前のフォーカスに戻す
                this.currentFocus.type = this.previousFocusType;
                this.clearAllFocus();
                this.previousFocusElement.classList.add('keyboard-focus');
            } else {
                // "はい"ボタンで閉じられた場合は通常通り最新セクションに戻る
                this.currentFocus.type = this.FOCUS_TYPES.STORY;
                this.updateFocus();
            }
        }

        /**
         * 警告ポップアップが表示された時の処理
         */
        handleWarningPopupShown() {
            this.currentFocus.type = this.FOCUS_TYPES.WARNING;
            const okButton = document.getElementById('warning-popup-ok');
            if (okButton) {
                okButton.classList.add('keyboard-focus');
            }
            
            // 処理中フラグを設定
            this.isProcessingInput = true;
            
            // 処理完了後にフラグをリセット
            setTimeout(() => {
                this.isProcessingInput = false;
            }, this.config.transitionDelay);
        }

        /**
         * 警告ポップアップが非表示になった時の処理
         */
        handleWarningPopupHidden() {
            // フォーカスをストーリーに戻す
            this.currentFocus.type = this.FOCUS_TYPES.STORY;
            // フォーカスを更新
            this.updateFocus();
        }
        
        /**
         * すべてのフォーカスをクリア
         */
        clearAllFocus() {
            document.querySelectorAll('.keyboard-focus').forEach(el => {
                el.classList.remove('keyboard-focus');
            });
        }
        
        /**
         * ポップアップのフォーカスをリセット（フォーカスなしの状態に）
         */
        resetPopupFocus() {
            const yesButton = document.getElementById('popup-yes');
            const noButton = document.getElementById('popup-no');
            
            if (yesButton) yesButton.classList.remove('keyboard-focus');
            if (noButton) noButton.classList.remove('keyboard-focus');
            
            this.popupFocusButton = 0;
        }
        
        /**
         * ポップアップの特定のボタンにフォーカスを設定
         * @param {number} buttonIndex 1:はい, 2:いいえ
         */
        setPopupFocus(buttonIndex) {
            // バリデーション
            if (buttonIndex !== 1 && buttonIndex !== 2) {
                return;
            }
            
            const yesButton = document.getElementById('popup-yes');
            const noButton = document.getElementById('popup-no');
            
            // すべてのフォーカスをクリア
            this.resetPopupFocus();
            
            if (buttonIndex === 1 && yesButton) {
                yesButton.classList.add('keyboard-focus');
                this.popupFocusButton = 1;
            } else if (buttonIndex === 2 && noButton) {
                noButton.classList.add('keyboard-focus');
                this.popupFocusButton = 2;
            }
        }
        
        /**
         * キーボードイベントのハンドラー
         * @param {KeyboardEvent} event キーボードイベント
         */
        handleKeyPress(event) {
            try {
                // イベントが無効な場合は処理せず戻る
                if (!event || !event.key) {
                    return;
                }
                
                // 無効化クラスを持つ要素内でのイベント発生は無視する
                if (this.isEventInDisabledContext(event)) {
                    return;
                }
                
                // テンキーのキーコードを取得
                const key = event.key;
                
                // 現在表示されているポップアップを確認（セキュアな要素取得）
                const popupOverlay = this.getElementSafely('popup-overlay');
                const warningPopup = this.getElementSafely('warning-popup-overlay');
                const isPopupVisible = popupOverlay && popupOverlay.style.display === 'flex';
                const isWarningVisible = warningPopup && warningPopup.style.display === 'flex';
                
                // ポップアップ処理中は入力を無視
                if (this.isPopupContext(isPopupVisible, isWarningVisible) && this.isProcessingInput) {
                    return;
                }
                
                // ポップアップ表示状態と内部状態が一致しない場合は修正
                this.syncPopupState(isPopupVisible, isWarningVisible);
                
                // コンテキストに応じたキー処理を実行
                if (this.currentFocus.type === this.FOCUS_TYPES.POPUP || isPopupVisible) {
                    this.isProcessingInput = true;
                    this.handlePopupKeyPress(key, event);
                    return;
                }
                
                if (this.currentFocus.type === this.FOCUS_TYPES.WARNING || isWarningVisible) {
                    this.handleWarningKeyPress(key, event);
                    return;
                }
                
                // メニュー関連の処理
                switch(this.currentFocus.type) {
                    case this.FOCUS_TYPES.STORY:
                        this.handleStoryKeyPress(key);
                        break;
                    case this.FOCUS_TYPES.DROPDOWN:
                        this.handleDropdownKeyPress(key);
                        break;
                    case this.FOCUS_TYPES.SUBMENU:
                        this.handleSubmenuKeyPress(key);
                        break;
                }
            } catch (error) {
                console.error('キーボード処理中にエラーが発生しました:', error);
                // エラーが発生しても、入力処理中フラグをリセットして処理を続行できるようにする
                this.isProcessingInput = false;
            }
        }
        
        /**
         * イベントが無効化コンテキスト内で発生したかどうかを確認
         * @param {Event} event チェック対象のイベント
         * @returns {boolean} 無効化コンテキスト内ならtrue
         */
        isEventInDisabledContext(event) {
            // イベントのターゲット要素を取得
            const target = event.target;
            if (!target) return false;
            
            // 要素自体または親要素に無効化クラスがあるかをチェック
            return this.hasDisabledParent(target);
        }
        
        /**
         * 要素またはその親要素に無効化クラスがあるかをチェック
         * @param {Element} element チェックする要素
         * @returns {boolean} 無効化クラスを持つ親が見つかればtrue
         */
        hasDisabledParent(element) {
            // element が存在しない、または Document オブジェクトに達した場合は終了
            if (!element || element === document) return false;
            
            // この要素が無効化クラスを持っているか確認
            if (element.classList && element.classList.contains(this.config.disabledClassName)) {
                return true;
            }
            
            // 親要素も再帰的にチェック
            return this.hasDisabledParent(element.parentElement);
        }
        
        /**
         * ID文字列をサニタイズ（単純なエスケープ）
         * @param {string} id サニタイズするID文字列
         * @returns {string} サニタイズされたID
         */
        sanitizeId(id) {
            // nullやundefinedチェック
            if (!id) return '';
            
            // 文字列型に変換
            const strId = String(id);
            
            // IDに使用できない文字を除去（空白、特殊文字など）
            return strId.replace(/[^a-zA-Z0-9_-]/g, '');
        }
        
        /**
         * 安全に要素を取得
         * @param {string} id 要素のID
         * @returns {HTMLElement|null} 取得した要素または null
         */
        getElementSafely(id) {
            try {
                return document.getElementById(this.sanitizeId(id));
            } catch (error) {
                console.error(`要素 ${id} の取得中にエラーが発生しました:`, error);
                return null;
            }
        }
        
        /**
         * ポップアップコンテキストかどうか確認
         * @param {boolean} isPopupVisible 通常ポップアップが表示中か
         * @param {boolean} isWarningVisible 警告ポップアップが表示中か
         * @returns {boolean} ポップアップコンテキストならtrue
         */
        isPopupContext(isPopupVisible, isWarningVisible) {
            return this.currentFocus.type === this.FOCUS_TYPES.POPUP || 
                isPopupVisible || 
                this.currentFocus.type === this.FOCUS_TYPES.WARNING || 
                isWarningVisible;
        }
        
        /**
         * ポップアップ状態の同期
         * @param {boolean} isPopupVisible 通常ポップアップが表示中か
         * @param {boolean} isWarningVisible 警告ポップアップが表示中か
         */
        syncPopupState(isPopupVisible, isWarningVisible) {
            if (isPopupVisible && this.currentFocus.type !== this.FOCUS_TYPES.POPUP) {
                this.currentFocus.type = this.FOCUS_TYPES.POPUP;
            } else if (isWarningVisible && this.currentFocus.type !== this.FOCUS_TYPES.WARNING) {
                this.currentFocus.type = this.FOCUS_TYPES.WARNING;
            }
        }
        
        /**
         * 警告ポップアップ表示中のキー操作処理
         * @param {string} key 押されたキー
         * @param {KeyboardEvent} event キーボードイベント
         */
        handleWarningKeyPress(key, event) {
            // 警告ポップアップで操作可能なキー
            if (this.isKey(key, [...this.KEY_MAPS.SELECT, ...this.KEY_MAPS.CANCEL, ...this.KEY_MAPS.OPTION_1, ...this.KEY_MAPS.OPTION_2, ...this.KEY_MAPS.OPTION_3])) {
                this.isProcessingInput = true;
                // 了解ボタンクリック
                const okButton = this.getElementSafely('warning-popup-ok');
                if (okButton) {
                    okButton.click();
                    // フォーカスタイプをストーリーに戻す
                    this.currentFocus.type = this.FOCUS_TYPES.STORY;
                    // 少し遅延させてからフォーカスを更新
                    setTimeout(() => {
                        this.updateFocus();
                        this.isProcessingInput = false;
                    }, this.config.transitionDelay);
                    event.preventDefault();
                }
            }
        }
        
        /**
         * ポップアップ表示中のキー操作処理
         * @param {string} key 押されたキー
         * @param {KeyboardEvent} event キーボードイベント
         */
        handlePopupKeyPress(key, event) {
            const popupYes = this.getElementSafely('popup-yes');
            const popupNo = this.getElementSafely('popup-no');
            
            // 左右キーでフォーカス移動
            if (this.isKey(key, this.KEY_MAPS.LEFT)) {
                // 左矢印キー - 「はい」ボタンにフォーカス
                this.setPopupFocus(1);
                event.preventDefault();
                setTimeout(() => { this.isProcessingInput = false; }, 50);
                return;
            }
            
            if (this.isKey(key, this.KEY_MAPS.RIGHT)) {
                // 右矢印キー - 「いいえ」ボタンにフォーカス
                this.setPopupFocus(2);
                event.preventDefault();
                setTimeout(() => { this.isProcessingInput = false; }, 50);
                return;
            }
            
            // はいボタン選択
            if (this.isKey(key, this.KEY_MAPS.OPTION_1)) {
                this.setPopupFocus(1);
                setTimeout(() => {
                    if (popupYes) popupYes.click();
                    this.isProcessingInput = false;
                }, this.config.transitionDelay);
                event.preventDefault();
                return;
            }
            
            // いいえボタン選択
            if (this.isKey(key, [...this.KEY_MAPS.OPTION_3, ...this.KEY_MAPS.CANCEL])) {
                this.setPopupFocus(2);
                setTimeout(() => {
                    if (popupNo) popupNo.click();
                    this.isProcessingInput = false;
                }, this.config.transitionDelay);
                event.preventDefault();
                return;
            }
            
            // Enterキーでフォーカスボタン選択
            if (this.isKey(key, this.KEY_MAPS.SELECT)) {
                if (this.popupFocusButton === 1 && popupYes) {
                    popupYes.click();
                    event.preventDefault();
                    setTimeout(() => { this.isProcessingInput = false; }, this.config.transitionDelay);
                    return;
                } else if (this.popupFocusButton === 2 && popupNo) {
                    popupNo.click();
                    event.preventDefault();
                    setTimeout(() => { this.isProcessingInput = false; }, this.config.transitionDelay);
                    return;
                }
            }
            
            // デフォルトでは即時にフラグをリセット
            this.isProcessingInput = false;
        }
        
        /**
         * ストーリーエリアでのキー操作処理
         * @param {string} key 押されたキー
         */
        handleStoryKeyPress(key) {
            // メニュー表示
            if (this.isKey(key, this.KEY_MAPS.MENU)) {
                this.openDropdownMenu();
                return;
            }
            
            // ページ上部へ戻る
            if (this.isKey(key, this.KEY_MAPS.TOP)) {
                const topButton = this.getElementSafely('scroll-top-button');
                if (topButton) topButton.click();
                return;
            }
            
            // トップページへ戻る - セキュリティを維持しながら ../index.html に移動
            if (this.isKey(key, this.KEY_MAPS.HOME)) {
                try {
                    // 現在のパスからの相対パスを使用するが、入力値を検証
                    const targetPath = '../index.html';
                    
                    // URLのバリデーション (シンプルな検証)
                    if (/^\.\.\/[a-zA-Z0-9_\-\.]+\.html$/.test(targetPath)) {
                        // 検証に通過した場合のみナビゲーション実行
                        window.location.href = targetPath;
                    } else {
                        console.error('不正なナビゲーションパスが検出されました');
                    }
                } catch (error) {
                    console.error('ホームページへの遷移中にエラーが発生しました:', error);
                }
                return;
            }
            
            // 方向キーの処理
            if (this.isKey(key, this.KEY_MAPS.UP)) {
                this.moveFocusInStory('up');
                return;
            }
            
            if (this.isKey(key, this.KEY_MAPS.DOWN)) {
                this.moveFocusInStory('down');
                return;
            }

            if (this.isKey(key, this.KEY_MAPS.LEFT)) {
                this.moveFocusInStory('left');
                return;
            }
            
            if (this.isKey(key, this.KEY_MAPS.RIGHT)) {
                this.moveFocusInStory('right');
                return;
            }
            
            // オプション選択
            if (this.isKey(key, this.KEY_MAPS.OPTION_1)) {
                this.selectOptionByNumber(1);
                return;
            }
            
            if (this.isKey(key, this.KEY_MAPS.OPTION_2)) {
                this.selectOptionByNumber(2);
                return;
            }
            
            if (this.isKey(key, this.KEY_MAPS.OPTION_3)) {
                this.selectOptionByNumber(3);
                return;
            }
            
            // エンターキーでフォーカス要素を選択
            if (this.isKey(key, this.KEY_MAPS.SELECT)) {
                this.selectFocusedButton();
                return;
            }
        }
        
        /**
         * ドロップダウンメニューでのキー操作処理
         * @param {string} key 押されたキー
         */
        handleDropdownKeyPress(key) {
            const dropdownItems = document.querySelectorAll('.dropdown-item');
            
            // メニューを閉じる
            if (this.isKey(key, this.KEY_MAPS.MENU)) {
                this.closeDropdownMenu();
                return;
            }
            
            // 上方向の移動
            if (this.isKey(key, this.KEY_MAPS.UP)) {
                if (this.currentFocus.index > 0) {
                    this.currentFocus.index--;
                    this.updateFocus();
                    
                    // サブメニューの自動展開処理
                    this.handleSubmenuAutoExpand(dropdownItems);
                }
                return;
            }
            
            // 下方向の移動
            if (this.isKey(key, this.KEY_MAPS.DOWN)) {
                if (this.currentFocus.index < dropdownItems.length - 1) {
                    this.currentFocus.index++;
                    this.updateFocus();
                    
                    // サブメニューの自動展開処理
                    this.handleSubmenuAutoExpand(dropdownItems);
                }
                return;
            }
            
            // 右方向（サブメニュー展開）
            if (this.isKey(key, this.KEY_MAPS.RIGHT)) {
                const currentItem = dropdownItems[this.currentFocus.index];
                if (currentItem && currentItem.classList.contains('has-submenu')) {
                    this.openSubmenu(currentItem);
                }
                return;
            }
            
            // 選択
            if (this.isKey(key, this.KEY_MAPS.SELECT)) {
                if (this.currentFocus.index < dropdownItems.length) {
                    const currentItem = dropdownItems[this.currentFocus.index];
                    
                    // サブメニューを持つ項目の場合は、サブメニューを開く
                    if (currentItem && currentItem.classList.contains('has-submenu')) {
                        this.openSubmenu(currentItem);
                    } else {
                        // 通常の項目はクリックする
                        currentItem.click();
                    }
                }
                return;
            }
        }
        
        /**
         * サブメニューを開く（安全な実装）
         * @param {HTMLElement} parentItem 親メニューアイテム
         */
        openSubmenu(parentItem) {
            if (!parentItem) return;
            
            // サブメニューを表示
            const submenu = parentItem.querySelector('.submenu');
            if (!submenu) return;
            
            // サブメニューを表示
            submenu.classList.add('submenu-visible');
            
            // フォーカスをサブメニューの最初の項目に移動
            this.currentFocus.type = this.FOCUS_TYPES.SUBMENU;
            this.currentFocus.parentIndex = this.currentFocus.index;
            this.currentFocus.index = 0;
            
            // テキストコンテンツの安全な取得
            try {
                const textContent = parentItem.textContent;
                this.currentFocus.submenuName = textContent ? textContent.trim() : '';
            } catch (error) {
                this.currentFocus.submenuName = '';
                console.error('サブメニュー名の取得中にエラーが発生しました:', error);
            }
            
            // フォーカスを更新
            this.updateFocus();
        }
        
        /**
         * サブメニューの自動展開処理（安全な実装）
         * @param {NodeList} dropdownItems ドロップダウンアイテムのリスト
         */
        handleSubmenuAutoExpand(dropdownItems) {
            if (!dropdownItems || !dropdownItems.length) return;
            
            if (this.currentFocus.index >= 0 && this.currentFocus.index < dropdownItems.length) {
                const currentItem = dropdownItems[this.currentFocus.index];
                if (currentItem && currentItem.classList.contains('has-submenu')) {
                    this.showSubmenuOnly(currentItem);
                } else {
                    // 他のサブメニューを閉じる
                    this.closeAllSubmenus();
                }
            }
        }
        
        /**
         * すべてのサブメニューを閉じる
         */
        closeAllSubmenus() {
            document.querySelectorAll('.submenu').forEach(submenu => {
                if (submenu) {
                    submenu.classList.remove('submenu-visible');
                }
            });
        }
        
        /**
         * 指定されたドロップダウンアイテムのサブメニューのみ表示
         * @param {HTMLElement} parentItem 親メニューアイテム
         */
        showSubmenuOnly(parentItem) {
            if (!parentItem) return;
            
            // 一旦すべてのサブメニューを閉じる
            this.closeAllSubmenus();
            
            // 指定されたアイテムのサブメニューを表示
            const submenu = parentItem.querySelector('.submenu');
            if (submenu) {
                submenu.classList.add('submenu-visible');
            }
        }
        
        /**
         * サブメニューでのキー操作処理
         * @param {string} key 押されたキー
         */
        handleSubmenuKeyPress(key) {
            // サブメニューアイテムを取得（クエリのエスケープ）
            const safeParentIndex = this.currentFocus.parentIndex + 1;
            const submenuItems = document.querySelectorAll(`.dropdown-item:nth-child(${safeParentIndex}) .submenu-item`);
            
            // メニューを閉じてストーリーに戻る
            if (this.isKey(key, this.KEY_MAPS.MENU)) {
                this.closeSubmenuAndDropdown();
                return;
            }
            
            // 上方向の移動
            if (this.isKey(key, this.KEY_MAPS.UP)) {
                if (this.currentFocus.index > 0) {
                    this.currentFocus.index--;
                    this.updateFocus();
                }
                return;
            }
            
            // 下方向の移動
            if (this.isKey(key, this.KEY_MAPS.DOWN)) {
                if (submenuItems.length && this.currentFocus.index < submenuItems.length - 1) {
                    this.currentFocus.index++;
                    this.updateFocus();
                }
                return;
            }
            
            // 左方向（サブメニューを閉じる）
            if (this.isKey(key, this.KEY_MAPS.LEFT)) {
                this.closeSubmenu();
                return;
            }
            
            // 選択
            if (this.isKey(key, this.KEY_MAPS.SELECT)) {
                if (submenuItems.length > 0 && this.currentFocus.index < submenuItems.length) {
                    submenuItems[this.currentFocus.index].click();
                }
                return;
            }
        }
        
        /**
         * サブメニューとドロップダウンを閉じる
         */
        closeSubmenuAndDropdown() {
            // サブメニューを非表示
            const safeParentIndex = this.currentFocus.parentIndex + 1;
            const submenu = document.querySelector(`.dropdown-item:nth-child(${safeParentIndex}) .submenu`);
            if (submenu) {
                submenu.classList.remove('submenu-visible');
            }
            
            // ドロップダウンメニューも閉じる
            this.closeDropdownMenu();
            
            // フォーカスをストーリーに直接戻す
            this.currentFocus.type = this.FOCUS_TYPES.STORY;
            this.currentFocus.parentIndex = -1;
            this.currentFocus.submenuName = '';
            
            this.updateFocus();
        }
        
        /**
         * サブメニューを閉じる
         */
        closeSubmenu() {
            // サブメニューを非表示
            const safeParentIndex = this.currentFocus.parentIndex + 1;
            const submenu = document.querySelector(`.dropdown-item:nth-child(${safeParentIndex}) .submenu`);
            if (submenu) {
                submenu.classList.remove('submenu-visible');
            }
            
            // フォーカスをドロップダウンに戻す
            this.currentFocus.type = this.FOCUS_TYPES.DROPDOWN;
            this.currentFocus.index = this.currentFocus.parentIndex;
            this.currentFocus.parentIndex = -1;
            this.currentFocus.submenuName = '';
            
            this.updateFocus();
        }
        
        /**
         * ストーリーエリア内でのフォーカス移動（安全な実装）
         * @param {string} direction 移動方向 ('up', 'down', 'left', 'right')
         */
        moveFocusInStory(direction) {
            // 方向のバリデーション
            if (!direction || !['up', 'down', 'left', 'right'].includes(direction)) {
                return;
            }
            
            if (direction === 'up' || direction === 'down') {
                // 上下キーの場合は異なるセクション間を移動
                this.moveBetweenSections(direction);
                return;
            }
            
            // 左右の場合は同一セクション内を移動
            this.moveWithinSection(direction);
        }
        
        /**
         * セクション内でフォーカスを移動（安全な実装）
         * @param {string} direction 移動方向 ('left', 'right')
         */
        moveWithinSection(direction) {
            // 方向のバリデーション
            if (!direction || !['left', 'right'].includes(direction)) {
                return;
            }
            
            // フォーカス対象のセクションを特定
            const targetSection = this.getTargetSection();
            if (!targetSection) return;
            
            // セクション内のボタンを取得
            const buttons = targetSection.querySelectorAll('.option-button, .next-button');
            if (!buttons.length) return;
            
            // 現在フォーカスのあるボタンを探す
            let focusedIndex = this.getFocusedElementIndex(buttons);
            
            // フォーカスがなければ最初のボタンにフォーカス
            if (focusedIndex === -1) {
                this.clearAllFocus();
                buttons[0].classList.add('keyboard-focus');
                return;
            }
            
            // 方向に応じてインデックスを更新（安全に）
            let newIndex = focusedIndex;
            if (direction === 'left') {
                newIndex = Math.max(0, focusedIndex - 1);
            } else if (direction === 'right') {
                newIndex = Math.min(buttons.length - 1, focusedIndex + 1);
            }
            
            // インデックスが変わった場合のみフォーカスを移動
            if (newIndex !== focusedIndex) {
                this.clearAllFocus();
                buttons[newIndex].classList.add('keyboard-focus');
                
                // スクロール処理を安全に実行
                try {
                    buttons[newIndex].scrollIntoView({ behavior: 'smooth', block: 'center' });
                } catch (error) {
                    console.error('スクロール処理中にエラーが発生しました:', error);
                    // フォールバックのスクロール処理
                    buttons[newIndex].scrollIntoView();
                }
            }
        }
        
        /**
         * フォーカス対象のセクションを取得（安全な実装）
         * @returns {HTMLElement} 対象セクション要素
         */
        getTargetSection() {
            try {
                // フォーカスがあるセクションを見つける
                const focusedElement = document.querySelector('.keyboard-focus');
                let targetSection = null;
                
                if (focusedElement) {
                    targetSection = focusedElement.closest('.story-section');
                }
                
                // フォーカス要素がなければ現在のセクションを使用
                if (!targetSection) {
                    targetSection = document.querySelector('.story-section.current');
                }
                
                return targetSection;
            } catch (error) {
                console.error('セクション取得中にエラーが発生しました:', error);
                return null;
            }
        }
        
        /**
         * フォーカスされている要素のインデックスを取得（安全な実装）
         * @param {NodeList} elements 要素リスト
         * @returns {number} インデックス（-1 = 見つからない）
         */
        getFocusedElementIndex(elements) {
            if (!elements || !elements.length) return -1;
            
            try {
                for (let i = 0; i < elements.length; i++) {
                    if (elements[i] && elements[i].classList && 
                        elements[i].classList.contains('keyboard-focus')) {
                        return i;
                    }
                }
            } catch (error) {
                console.error('フォーカス要素の検索中にエラーが発生しました:', error);
            }
            
            return -1;
        }
        
        /**
         * セクション間のフォーカス移動（安全な実装）
         * @param {string} direction 移動方向 ('up', 'down')
         */
        moveBetweenSections(direction) {
            // 方向のバリデーション
            if (!direction || !['up', 'down'].includes(direction)) {
                return;
            }
            
            // すべてのセクションを取得
            const sections = document.querySelectorAll('.story-section');
            if (!sections.length) return;
            
            // 現在のセクションとボタンのインデックスを特定
            const { sectionIndex, buttonIndex } = this.getCurrentSectionIndices(sections);
            if (sectionIndex === -1) return;
            
            // すべてのフォーカスをクリア
            this.clearAllFocus();
            
            // 方向に応じて移動先のセクションを決定
            let targetIndex = sectionIndex;
            if (direction === 'up') {
                targetIndex = Math.max(0, sectionIndex - 1);
            } else if (direction === 'down') {
                targetIndex = Math.min(sections.length - 1, sectionIndex + 1);
            }
            
            // 対象セクションのボタンにフォーカスを当てる
            this.focusButtonInSection(sections[targetIndex], buttonIndex);
            
            // セクションが変わったことを視覚的に示すためのハイライト効果
            if (targetIndex !== sectionIndex) {
                this.highlightSection(sections[targetIndex]);
            }
        }
        
        /**
         * 現在のセクションとボタンのインデックスを取得（安全な実装）
         * @param {NodeList} sections セクションのリスト
         * @returns {Object} セクションインデックスとボタンインデックス
         */
        getCurrentSectionIndices(sections) {
            if (!sections || !sections.length) {
                return { sectionIndex: -1, buttonIndex: -1 };
            }
            
            let sectionIndex = -1;
            let buttonIndex = -1;
            
            try {
                // 現在フォーカスがある要素を探す
                const focusedElement = document.querySelector('.keyboard-focus');
                if (focusedElement) {
                    // フォーカス要素が属するセクションを特定
                    const parentSection = focusedElement.closest('.story-section');
                    if (parentSection) {
                        const sectionsArray = Array.from(sections);
                        sectionIndex = sectionsArray.indexOf(parentSection);
                        
                        // このセクション内でのボタンのインデックスを特定
                        const buttons = parentSection.querySelectorAll('.option-button, .next-button');
                        if (buttons.length) {
                            buttonIndex = Array.from(buttons).indexOf(focusedElement);
                        }
                    }
                }
                
                // フォーカスがなければ、現在のセクションを使用
                if (sectionIndex === -1) {
                    for (let i = 0; i < sections.length; i++) {
                        if (sections[i].classList.contains('current')) {
                            sectionIndex = i;
                            break;
                        }
                    }
                }
            } catch (error) {
                console.error('セクションインデックスの取得中にエラーが発生しました:', error);
                sectionIndex = -1;
                buttonIndex = -1;
            }
            
            return { sectionIndex, buttonIndex };
        }
        
        /**
         * 指定されたセクション内のボタンにフォーカスを当てる（安全な実装）
         * @param {HTMLElement} section 対象セクション
         * @param {number} preferredButtonIndex 希望するボタンインデックス
         */
        focusButtonInSection(section, preferredButtonIndex) {
            if (!section) return;
            
            try {
                const buttons = section.querySelectorAll('.option-button, .next-button');
                
                // ボタンが存在する場合
                if (buttons.length > 0) {
                    // 同じ相対位置のボタンにフォーカスするか、最初のボタンにフォーカス
                    let buttonIndex = 0; // デフォルトは最初のボタン
                    
                    // 希望するボタンインデックスが有効範囲内なら使用
                    if (preferredButtonIndex >= 0 && preferredButtonIndex < buttons.length) {
                        buttonIndex = preferredButtonIndex;
                    }
                    
                    // 明示的にインデックスの範囲チェック
                    if (buttonIndex >= 0 && buttonIndex < buttons.length) {
                        buttons[buttonIndex].classList.add('keyboard-focus');
                        
                        // スクロール処理を安全に実行
                        try {
                            buttons[buttonIndex].scrollIntoView({ behavior: 'smooth', block: 'center' });
                        } catch (error) {
                            console.error('スクロール処理中にエラーが発生しました:', error);
                            // フォールバックのスクロール処理
                            buttons[buttonIndex].scrollIntoView();
                        }
                    }
                }
            } catch (error) {
                console.error('セクション内ボタンのフォーカス中にエラーが発生しました:', error);
            }
        }
        
        /**
         * セクションにハイライト効果を適用（安全な実装）
         * @param {HTMLElement} section ハイライトするセクション
         */
        highlightSection(section) {
            if (!section) return;
            
            try {
                section.classList.add('keyboard-section-highlight');
                
                // タイムアウトID保持のためのプロパティ名（セクション要素に安全に付与）
                const timeoutPropName = '_highlightTimeout';
                
                // 前回のタイムアウトが残っている場合はクリア
                if (section[timeoutPropName]) {
                    clearTimeout(section[timeoutPropName]);
                }
                
                // 新しいタイムアウトを設定
                section[timeoutPropName] = setTimeout(() => {
                    section.classList.remove('keyboard-section-highlight');
                    section[timeoutPropName] = null;
                }, 500);
            } catch (error) {
                console.error('セクションハイライト処理中にエラーが発生しました:', error);
                // エラー時のクリーンアップ
                if (section) {
                    section.classList.remove('keyboard-section-highlight');
                }
            }
        }
        
        /**
         * オプションを番号で選択（安全な実装）
         * @param {number} optionNumber 選択するオプション番号
         */
        selectOptionByNumber(optionNumber) {
            // 数値の検証
            if (typeof optionNumber !== 'number' || optionNumber < 1 || optionNumber > 3) {
                return;
            }
            
            // 対象セクションを特定
            const targetSection = this.getTargetSection();
            if (!targetSection) return;
            
            // オプションボタンと次へボタンを取得
            const optionButtons = targetSection.querySelectorAll('.option-button');
            const nextButton = targetSection.querySelector('.next-button');
            
            // 次へボタンがある場合は優先処理
            if (nextButton && this.isValidOptionNumber(optionNumber)) {
                nextButton.click();
                return;
            }
            
            // オプションボタンがない場合は処理終了
            if (!optionButtons || optionButtons.length === 0) return;
            
            // 選択肢が1つだけの場合は特別処理
            if (optionButtons.length === 1 && this.isValidOptionNumber(optionNumber)) {
                optionButtons[0].click();
                return;
            }
            
            // オプション番号に応じた処理
            this.handleOptionNumberSelection(optionButtons, optionNumber);
        }
        
        /**
         * 有効なオプション番号かを確認
         * @param {number} optionNumber 確認するオプション番号
         * @returns {boolean} 有効な番号ならtrue
         */
        isValidOptionNumber(optionNumber) {
            return optionNumber === 1 || optionNumber === 2 || optionNumber === 3;
        }
        
        /**
         * オプション番号に応じた選択処理（安全な実装）
         * @param {NodeList} optionButtons オプションボタンのリスト
         * @param {number} optionNumber 選択するオプション番号
         */
        handleOptionNumberSelection(optionButtons, optionNumber) {
            if (!optionButtons || !optionButtons.length) return;
            
            // 入力値の検証
            if (typeof optionNumber !== 'number') return;
            
            try {
                // オプション1の処理 - 常に最初の選択肢
                if (optionNumber === 1 && optionButtons.length >= 1) {
                    optionButtons[0].click();
                    return;
                }
                
                // 3つ以上ある場合の処理
                if (optionButtons.length >= 3) {
                    if (optionNumber === 2) {
                        optionButtons[1].click(); // 2番目の選択肢
                    } else if (optionNumber === 3) {
                        optionButtons[2].click(); // 3番目の選択肢
                    }
                } 
                // 2つのみの場合の処理
                else if (optionButtons.length === 2) {
                    if (optionNumber === 3) {
                        optionButtons[1].click(); // 2番目の選択肢を3キーで選択
                    } else if (optionNumber === 2) {
                        optionButtons[1].click(); // 2番目の選択肢を2キーでも選択可能に
                    }
                }
            } catch (error) {
                console.error('オプション選択処理中にエラーが発生しました:', error);
            }
        }
        
        /**
         * フォーカスがあるボタンを選択（安全な実装）
         */
        selectFocusedButton() {
            try {
                const focusedButton = document.querySelector('.keyboard-focus');
                if (focusedButton) {
                    focusedButton.click();
                }
            } catch (error) {
                console.error('フォーカスボタンの選択中にエラーが発生しました:', error);
            }
        }
        
        /**
         * ドロップダウンメニューを開く（安全な実装）
         */
        openDropdownMenu() {
            try {
                const dropdownMenu = this.getElementSafely('dropdown-menu');
                if (!dropdownMenu) return;
                
                // CSSクラスを追加し、スタイルプロパティも直接設定
                dropdownMenu.classList.add('dropdown-visible');
                dropdownMenu.style.display = 'block';
                this.isDropdownVisible = true;
                
                // メニューレジェンドを表示
                const menuLegend = this.getElementSafely('menu-legend');
                if (menuLegend) {
                    menuLegend.style.display = 'block';
                }
                
                // フォーカスをドロップダウンに移動
                this.currentFocus.type = this.FOCUS_TYPES.DROPDOWN;
                this.currentFocus.index = 0;
                this.updateFocus();
            } catch (error) {
                console.error('ドロップダウンメニューのオープン中にエラーが発生しました:', error);
            }
        }

        /**
         * ドロップダウンメニューを閉じる（安全な実装）
         */
        closeDropdownMenu() {
            try {
                const dropdownMenu = this.getElementSafely('dropdown-menu');
                if (!dropdownMenu) return;
                
                // CSSクラスを削除し、スタイルプロパティも直接設定
                dropdownMenu.classList.remove('dropdown-visible');
                dropdownMenu.style.display = 'none';
                this.isDropdownVisible = false;
                
                // すべてのサブメニューを閉じる
                this.closeAllSubmenus();
                
                // メニューレジェンドを非表示
                const menuLegend = this.getElementSafely('menu-legend');
                if (menuLegend) {
                    menuLegend.style.display = 'none';
                }
                
                // フォーカスをストーリーに戻す
                this.currentFocus.type = this.FOCUS_TYPES.STORY;
                this.updateFocus();
            } catch (error) {
                console.error('ドロップダウンメニューのクローズ中にエラーが発生しました:', error);
            }
        }
        
        /**
         * フォーカスを更新（安全な実装）
         */
        updateFocus() {
            try {
                // すべてのフォーカスをクリア
                this.clearAllFocus();
                
                // 現在のフォーカスタイプに基づいて新しいフォーカスを設定
                switch(this.currentFocus.type) {
                    case this.FOCUS_TYPES.DROPDOWN:
                        this.updateDropdownFocus();
                        break;
                    case this.FOCUS_TYPES.SUBMENU:
                        this.updateSubmenuFocus();
                        break;
                    case this.FOCUS_TYPES.STORY:
                        this.updateStoryFocus();
                        break;
                    case this.FOCUS_TYPES.POPUP:
                        this.updatePopupFocus();
                        break;
                }
            } catch (error) {
                console.error('フォーカスの更新中にエラーが発生しました:', error);
            }
        }
        
        /**
         * ドロップダウンのフォーカスを更新（安全な実装）
         */
        updateDropdownFocus() {
            const dropdownItems = document.querySelectorAll('.dropdown-item');
            if (dropdownItems.length > 0 && 
                this.currentFocus.index >= 0 && 
                this.currentFocus.index < dropdownItems.length) {
                dropdownItems[this.currentFocus.index].classList.add('keyboard-focus');
            }
        }
        
        /**
         * サブメニューのフォーカスを更新（安全な実装）
         */
        updateSubmenuFocus() {
            const safeParentIndex = this.currentFocus.parentIndex + 1;
            const submenuItems = document.querySelectorAll(`.dropdown-item:nth-child(${safeParentIndex}) .submenu-item`);
            
            if (submenuItems.length > 0 && 
                this.currentFocus.index >= 0 && 
                this.currentFocus.index < submenuItems.length) {
                submenuItems[this.currentFocus.index].classList.add('keyboard-focus');
            }
        }
        
        /**
         * ストーリーのフォーカスを更新（安全な実装）
         */
        updateStoryFocus() {
            try {
                const currentSection = document.querySelector('.story-section.current');
                if (currentSection) {
                    const firstButton = currentSection.querySelector('.option-button, .next-button');
                    if (firstButton) {
                        firstButton.classList.add('keyboard-focus');
                    }
                }
            } catch (error) {
                console.error('ストーリーフォーカスの更新中にエラーが発生しました:', error);
            }
        }
        
        /**
         * ポップアップのフォーカスを更新（安全な実装）
         */
        updatePopupFocus() {
            try {
                const yesButton = this.getElementSafely('popup-yes');
                const noButton = this.getElementSafely('popup-no');
                
                if (this.popupFocusButton === 1 && yesButton) {
                    yesButton.classList.add('keyboard-focus');
                } else if (this.popupFocusButton === 2 && noButton) {
                    noButton.classList.add('keyboard-focus');
                }
            } catch (error) {
                console.error('ポップアップフォーカスの更新中にエラーが発生しました:', error);
            }
        }
        
        /**
         * フォーカス表示用のスタイルを確認（CSSファイルに事前定義）
         */
        addFocusStyles() {
            try {
                // CSSがすでにstyle.cssに定義されていることを確認するのみ
                const testElement = document.createElement('div');
                testElement.classList.add('keyboard-focus');
                document.body.appendChild(testElement);
                
                // スタイルが適用されているか確認（開発/テスト時のみ）
                const computedStyle = window.getComputedStyle(testElement);
                const hasOutline = computedStyle.outline.includes('solid') && 
                                  computedStyle.outline.includes('rgb(255, 204, 0)');
                
                if (!hasOutline) {
                    console.warn('keyboard-focusスタイルがCSSに定義されていない可能性があります');
                }
                
                // テスト要素を削除
                document.body.removeChild(testElement);
            } catch (error) {
                console.error('フォーカススタイルの確認中にエラーが発生しました:', error);
            }
        }
    }

    /**
     * テンキー操作ガイドをドラッグ可能にする（モジュールパターン実装）
     */
    function initDraggableKeypadGuide() {
        // プライベート変数
        let isDragging = false;
        let offsetX, offsetY;
        let dragTimeoutId = null;
        
        try {
            const helpBox = document.getElementById('keypad-guide');
            if (!helpBox) return;
            
            // 既に初期化済みの場合は処理をスキップ
            if (helpBox.getAttribute('data-drag-initialized') === 'true') return;
            helpBox.setAttribute('data-drag-initialized', 'true');
            
            // マウスダウンイベント（安全な実装）
            helpBox.addEventListener('mousedown', function(e) {
                // 右クリックは無視
                if (e.button !== 0) return;
                
                isDragging = true;
                offsetX = e.clientX - helpBox.getBoundingClientRect().left;
                offsetY = e.clientY - helpBox.getBoundingClientRect().top;
                helpBox.classList.add('keypad-guide-grabbing');
                
                // イベントのデフォルト動作を抑制
                e.preventDefault();
            });
            
            // マウス移動イベント（安全な実装 + スロットリング）
            document.addEventListener('mousemove', function(e) {
                if (!isDragging) return;
                
                // スロットリング処理
                if (dragTimeoutId) return;
                
                dragTimeoutId = setTimeout(function() {
                    // 画面内に収まるように位置を制限
                    const x = Math.min(
                        Math.max(0, e.clientX - offsetX),
                        window.innerWidth - helpBox.offsetWidth
                    );
                    
                    const y = Math.min(
                        Math.max(0, e.clientY - offsetY),
                        window.innerHeight - helpBox.offsetHeight
                    );
                    
                    // CSS変数で位置を設定
                    helpBox.classList.add('keypad-guide-position');
                    helpBox.style.setProperty('--guide-left', `${x}px`);
                    helpBox.style.setProperty('--guide-top', `${y}px`);
                    
                    dragTimeoutId = null;
                }, 16); // 約60FPS相当の更新頻度
            });
            
            // マウスアップイベント（安全な実装）
            document.addEventListener('mouseup', function() {
                if (isDragging) {
                    isDragging = false;
                    helpBox.classList.remove('keypad-guide-grabbing');
                    
                    // タイムアウトをクリア
                    if (dragTimeoutId) {
                        clearTimeout(dragTimeoutId);
                        dragTimeoutId = null;
                    }
                }
            });
            
            // マウス離脱時のクリーンアップ
            document.addEventListener('mouseleave', function() {
                if (isDragging) {
                    isDragging = false;
                    helpBox.classList.remove('keypad-guide-grabbing');
                    
                    // タイムアウトをクリア
                    if (dragTimeoutId) {
                        clearTimeout(dragTimeoutId);
                        dragTimeoutId = null;
                    }
                }
            });
            
            // 閉じるボタンのクリックイベント（安全な実装）
            const closeButton = document.getElementById('close-keypad-guide');
            if (closeButton) {
                closeButton.addEventListener('click', function(e) {
                    const keypadGuide = document.getElementById('keypad-guide');
                    if (keypadGuide) {
                        keypadGuide.classList.add('keypad-guide-hidden');
                    }
                    
                    // イベントの伝播を停止
                    e.stopPropagation();
                });
            }
        } catch (error) {
            console.error('キーパッドガイドの初期化中にエラーが発生しました:', error);
            
            // クリーンアップ処理
            isDragging = false;
            if (dragTimeoutId) {
                clearTimeout(dragTimeoutId);
                dragTimeoutId = null;
            }
        }
    }
    
    // キーボードマネージャのファクトリ関数（安全なインスタンス生成）
    function createKeyboardManager(config) {
        try {
            return new KeyboardManager(config);
        } catch (error) {
            console.error('キーボードマネージャの作成中にエラーが発生しました:', error);
            return null;
        }
    }
    
    // DOMContentLoaded イベントでキーボードマネージャーを初期化
    document.addEventListener('DOMContentLoaded', function() {
        try {
            // グローバル変数を最小限に抑える（モジュールの外部に露出させるのは最小限の関数のみ）
            window.keyboardManager = createKeyboardManager();
            
            // テンキー操作ガイドのドラッグ機能を初期化
            initDraggableKeypadGuide();
        } catch (error) {
            console.error('キーボードマネージャの初期化中にエラーが発生しました:', error);
        }
    });
    
    // 公開API
    window.keyboardManagerAPI = {
        // キーボード操作の有効/無効を切り替える関数
        enableKeyboardControl: function() {
            if (window.keyboardManager) {
                window.keyboardManager.enable();
                return true;
            }
            return false;
        },
        
        disableKeyboardControl: function() {
            if (window.keyboardManager) {
                window.keyboardManager.disable();
                return true;
            }
            return false;
        },
        
        // キーボードマネージャの再初期化
        reinitialize: function(config) {
            try {
                // 既存のインスタンスがあれば破棄
                if (window.keyboardManager) {
                    window.keyboardManager.destroy();
                }
                
                // 新しいインスタンスを作成
                window.keyboardManager = createKeyboardManager(config);
                return true;
            } catch (error) {
                console.error('キーボードマネージャの再初期化中にエラーが発生しました:', error);
                return false;
            }
        }
    };
})();