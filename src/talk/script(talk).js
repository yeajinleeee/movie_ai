import { auth, getUserProfile, signOut } from '../firebase.js';

// [script(talk).js] 상단 쪽에 추가
// 기본 프로필 이미지 (회색 사람 아이콘 - 파일 없어도 작동함)
const DEFAULT_PROFILE_IMG = "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0iI2NjYyI+PHBhdGggZD0iTTEyIDEyYzIuMjEgMCA0LTEuNzkgNC00cy0xLjc5LTQtNC00LTQgMS43OS00IDQgMS43OSA0IDQgNHptMCAyYy0yLjY3IDAtOCAxLjM0LTggNHYyaDE2di0yYzAtMi42Ni01LjMzLTQtOC00eiIvPjwvc3ZnPg==";

const movieMap = {
    '극한직업': 'extreme_job',
    '암수살인': 'DarkFigureofCrime',
    '1987' : '1987',
    '도가니': 'dogani',
    '더킹': 'theking',
    '타짜:원아이드잭': 'tazza',
    '베테랑':'veteran',
};

// 현재 대화 세션 정보 저장
let currentSession = {
    movieId: '',
    movieTitle: '',
    characterName: ''
};

document.addEventListener('DOMContentLoaded', () => {

    // ========== 1. Firebase 로그인 (기존 동일) ==========
    const loginSection = document.getElementById('login-section');
    const profileSection = document.getElementById('profile-section');
    const logoutButton = document.getElementById('logout-button');
    const nicknameContainer = document.getElementById('nickname-container');

    auth.onAuthStateChanged(async (user) => {
        if(user) {
            const userProfile = await getUserProfile(user.uid);
            if(loginSection) loginSection.style.display = 'none';
            if(profileSection) profileSection.style.display = 'flex';
            if (userProfile && nicknameContainer) {
                nicknameContainer.innerHTML = `<a href="/mypage">${userProfile.nickname}님</a>`;
            } else if(nicknameContainer) {
                nicknameContainer.innerHTML= '프로필 없음';
            }
        } else {
            if(loginSection) loginSection.style.display = 'block';
            if(profileSection) profileSection.style.display = 'none';
        }
    });

    if (logoutButton) {
        logoutButton.addEventListener('click', () => {
            signOut(auth).then(() => {
                alert('로그아웃 되었습니다.');
                window.location.reload();
            }).catch((error) => console.error('로그아웃 오류:', error));
        });
    }

    // ========== 2. DOM 요소 ==========
    const talkSearchInput = document.getElementById('talk-search-input');
    const talkSearchButton = document.querySelector('.search-bar button'); 
    const gridContainer = document.querySelector('.results-grid'); 

// ========== 3. 영화 카드 HTML 생성 ==========
    function createMovieCardHTML(movie) {
        
        // 1. 포스터 이미지 안전하게 처리 (home.js 방식)
        let posterUrl = '/src/public/image/no_image.jpeg'; // 기본값

        if (movie.posters && typeof movie.posters === 'string' && movie.posters.trim() !== '') {
            const splitPosters = movie.posters.split('|');
            if (splitPosters.length > 0 && splitPosters[0].trim() !== '') {
                posterUrl = splitPosters[0].trim();
            }
        }

        // 2. 제목 정제 (!HS, !HE 태그 제거)
        const cleanTitle = movie.title
            .replace(/!HS|!HE/g, '')
            .replace(/^\s+|\s+$/g, '') // 앞뒤 공백 제거
            .replace(/ +/g, ' ');       // 다중 공백 하나로

        // 3. 줄거리 처리
        let plotText = '줄거리 정보가 없습니다.';
        if (movie.plots && movie.plots.plot && movie.plots.plot.length > 0) {
            plotText = movie.plots.plot[0].plotText;
        }

        const mappedId = movieMap[cleanTitle.replace(/\s/g, '')] || movieMap[cleanTitle]; // 공백 제거 후 매핑 확인 시도
        
        // 4. 버튼 영역 (로딩 전)
        let actionHtml = '';
        if (mappedId) {
            actionHtml = `<div class="char-loading-area" 
                                data-movie-id="${mappedId}" 
                                data-movie-title="${cleanTitle}"
                                style="margin-top:10px; min-height:30px;">
                            <span style="font-size:12px; color:gray;">캐릭터 확인 중...</span>
                        </div>`;
        } else {
            actionHtml = `<button class="talk-btn disabled" disabled style="margin-top:10px; width:100%; cursor: not-allowed; opacity: 0.6;">🚫 대화 데이터 없음</button>`;
        }

        // 5. HTML 반환 (img 태그에 onerror 추가됨)
        return `
            <div class="movie-card">
                <img src="${posterUrl}" 
                    alt="${cleanTitle} 포스터" 
                    class="movie-poster"
                    onerror="this.onerror=null; this.src='/src/public/image/no_image.jpeg';">
                <div class="movie-info">
                    <h3>${cleanTitle} (${movie.prodYear})</h3>
                    <p><strong>장르:</strong> ${movie.genre || '정보 없음'}</p>
                    <p class="plot-text"><strong>줄거리:</strong> ${plotText.substring(0, 80)}${plotText.length > 80 ? '...' : ''}</p>
                    ${actionHtml}
                </div>
            </div>
        `;
    }

    //배열 섞는 함수
    function shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    }

    // ========== 4. 영화 검색 및 표시 ==========
    async function fetchAndDisplayMovies(url) {
        if (!gridContainer) return;
        gridContainer.innerHTML = '<p style="color:white; padding:20px;">영화 목록을 불러오는 중...</p>'; 

        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            
            const movies = await response.json();
            gridContainer.innerHTML = ''; 

            if (!movies || movies.length === 0) {
                gridContainer.innerHTML = `<p style="color:white; padding:20px;">검색된 영화가 없습니다.</p>`;
                return;
            }

            if (movies && Array.isArray(movies)) {
                shuffleArray(movies);
            }

            // 1. 영화 카드들을 먼저 화면에 싹 그립니다.
            movies.forEach(movie => {
                const cardHtml = createMovieCardHTML(movie);
                gridContainer.insertAdjacentHTML('beforeend', cardHtml);
            });

            // 2. ★ [추가] 화면에 그려진 영화들에 대해 캐릭터 목록을 로딩합니다.
            loadCharactersForVisibleCards();

        } catch (error) { 
            console.error('Error loading movies:', error);
            gridContainer.innerHTML = '<p style="color:white; padding:20px;">영화 목록을 불러오는 데 실패했습니다.</p>';
        }
    }


// [수정됨] 영화 카드 내 캐릭터 버튼 생성 함수
    function loadCharactersForVisibleCards() {
            const loadingAreas = document.querySelectorAll('.char-loading-area');
            
            loadingAreas.forEach(async (area) => {
                const movieId = area.dataset.movieId;
                const movieTitle = area.dataset.movieTitle;

                try {
                    const res = await fetch(`/api/characters/${movieId}`);
                    const data = await res.json();

                    if (data.characters && data.characters.length > 0) {
                        
                        const buttonsHtml = data.characters.map(charData => {
                            const charName = charData.name || charData; 
                            
                            // ★ 수정됨: 서버가 준 이미지가 있으면 쓰고, 없으면 기본 아이콘
                            let imgSrc = charData.image; 
                            if (!imgSrc || imgSrc === "") {
                                imgSrc = DEFAULT_PROFILE_IMG;
                            }

                            return `
                            <button class="direct-char-btn"
                                data-movie-id="${movieId}"
                                data-movie-title="${movieTitle}"
                                data-char-name="${charName}"
                                data-char-img="${imgSrc}"
                                style="
                                    display: inline-flex; align-items: center; gap: 6px; margin: 4px; padding: 6px 12px; 
                                    cursor: pointer; background: #fff; color: #333; border: 1px solid #ddd; border-radius: 20px;
                                    box-shadow: 0 1px 2px rgba(0,0,0,0.1); transition: all 0.2s;
                                "
                                onmouseover="this.style.background='#f0f8ff'; this.style.borderColor='#007bff';"
                                onmouseout="this.style.background='#fff'; this.style.borderColor='#ddd';"
                            >
                                <img src="${imgSrc}" 
                                    style="width: 24px; height: 24px; border-radius: 50%; object-fit: cover; border: 1px solid #eee;"
                                    onerror="this.src='${DEFAULT_PROFILE_IMG}'" 
                                >
                                <span style="font-size: 13px; font-weight: 500; pointer-events: none;">${charName}</span>
                            </button>
                            `;
                        }).join('');
                        
                        area.innerHTML = `<div style="display:flex; flex-wrap:wrap; gap:2px;">${buttonsHtml}</div>`;
                    } else {
                        area.innerHTML = `<span style="font-size:12px; color:gray;">대화 가능한 캐릭터가 없습니다.</span>`;
                    }
                } catch (err) {
                    area.innerHTML = `<span style="font-size:12px; color:red;">로딩 실패</span>`;
                }
            });
        }

    // ========== 5. 이벤트 리스너 ==========
    let selectedGenre = '';
    let selectedYearStart = '';
    let selectedYearEnd = '';
    
    //필터 버튼 클릭 이벤트 설정 함수 
    function setupFilterButtons() {
        const yearButtons = document.querySelectorAll('#year-filter button');
        const genreButtons = document.querySelectorAll('#genre-filter button');
        
        yearButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                //클릭된 버튼 확실하게 가져오기 위함 
                const clickedBtn = e.currentTarget;

                //이미 선택된 거라면 취소 기능
                if (clickedBtn.classList.contains('active')) {
                    clickedBtn.classList.remove('active');
                    selectedYearStart = '';
                    selectedYearEnd = '';
                } else {
                    //다른 버튼들 선택 해제
                    yearButtons.forEach(b => b.classList.remove('active'));
                    //현재 버튼 선택
                    clickedBtn.classList.add('active');

                    //텍스트에서 시작 년도 추출
                    const text = clickedBtn.innerText;
                    const years = text.match(/\d{4}/g);
                    if (years && years.length >= 2) {
                        selectedYearStart = years[0];
                        selectedYearEnd = years[1];
                    } else if (years && years.lenght === 1) {
                        selectedYearStart = years[0];
                        selectedYearEnd = years[0];
                    }
                }
            });
        });

        //장르 버튼들
        genreButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {

                const clickedBtn = e.currentTarget;

                if (clickedBtn.classList.contains('active')){
                    clickedBtn.classList.remove('active');
                    selectedGenre = '';
                } else {
                    genreButtons.forEach(b => b.classList.remove('active'));
                    clickedBtn.classList.add('active');
                    selectedGenre = clickedBtn.innerText.trim();
                }
            });
        });
    }

    //통합 검색 함수
    function performSearch() {
        const titleInput = document.getElementById('talk-search-input');
        const title = titleInput ? titleInput.value.trim() : '';

        //url 파라미터 생성
        const params = new URLSearchParams();

        //검색어 
        if (title) params.append('title', title);

        //장르
        if (selectedGenre) params.append('genre', selectedGenre);

        //연도
        if (selectedYearStart && selectedYearEnd) {
            // 시작일: 해당 년도 1월 1일
            params.append('releaseDts', `${selectedYearStart}0101`);
            // 종료일: 해당 년도 12월 31일
            params.append('releaseDte', `${selectedYearEnd}1231`);
        }

        //정렬
        params.append('sort', 'prodYear,1');
        
        //한번에 가져올 개수
        params.append('listCount', '20');

        //api 호출 
        const finalUrl = `/api/search?${params.toString()}`;
        console.log('검색 요청:', finalUrl);

        fetchAndDisplayMovies(finalUrl)
    }

        //실행
        //필터 버튼 세팅
        setupFilterButtons();
    
        //상단 검색바 돋보기 버튼 
        if (talkSearchButton) {
            talkSearchButton.addEventListener('click', () => {
                const query = talkSearchInput.value.trim();
                if (query) fetchAndDisplayMovies(`/api/search?title=${encodeURIComponent(query)}`);
            });
        }

        //상단 검색바 엔터키
        if (talkSearchInput) {
            talkSearchInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    const query = talkSearchInput.value.trim();
                    if (query) fetchAndDisplayMovies(`/api/search?title=${encodeURIComponent(query)}`);
                }
            });
        }

        //하단 필터 영역의 영화 검색 버튼 
        const filterSearchBtn = document.querySelector('.search-button');
        if (filterSearchBtn) {
            filterSearchBtn.addEventListener('click', performSearch);
        }

    // 초기 로드
    fetchAndDisplayMovies(`/api/search?sort=prodYear,1&listCount=50`);


    // ========== 6. 채팅 로직 (직통 연결) ==========

// 6-1. 클릭 이벤트 (이벤트 위임)
    gridContainer.addEventListener('click', (e) => {
        // 버튼 자체 혹은 버튼 안의 이미지를 클릭했을 때 처리
        const btn = e.target.closest('.direct-char-btn');
        
        if (btn) {
            const movieId = btn.dataset.movieId;
            const movieTitle = btn.dataset.movieTitle;
            const charName = btn.dataset.charName;
            // 버튼 데이터셋에 저장해둔 이미지 경로 가져오기
            const charImg = btn.dataset.charImg; 

            // 모달 열고 바로 채팅 시작
            const chatModal = document.getElementById('chat-modal');
            chatModal.classList.remove('hidden');
            chatModal.style.display = 'block';

            // startChat 함수에 이미지 경로도 넘겨줍니다 (함수 수정 필요)
            startChat(movieId, movieTitle, charName, charImg);
        }
    });

    function startChat(movieId, movieTitle, charName, charImg) {
            currentSession.movieId = movieId;
            currentSession.characterName = charName;
            currentSession.movieTitle = movieTitle;
            
            const chatContainer = document.querySelector('.chat-container');

            // 이미지가 없으면 기본 아이콘 사용
            let finalImg = charImg;
            if (!finalImg || finalImg === "undefined" || finalImg === "") {
                finalImg = DEFAULT_PROFILE_IMG;
            }
            

            chatContainer.innerHTML = `
                <div class="chat-header" style="display:flex; justify-content:space-between; align-items:center; padding:10px; border-bottom:1px solid #ddd;">
                    <div class="chat-title" style="display:flex; align-items:center; gap:10px;">
                        <img src="${finalImg}" 
                            style="width:40px; height:40px; border-radius:50%; object-fit:cover; border:1px solid #ccc; background:#fff;"
                            onerror="this.src='${DEFAULT_PROFILE_IMG}'"> 
                        
                        <div style="display:flex; flex-direction:column;">
                            <span style="font-weight:bold; font-size:1.1em;">${charName}</span>
                            <span style="font-size:0.8em; color:#888;">${movieTitle}</span>
                        </div>
                    </div>
                    <button class="close-btn" id="chat-close-btn" style="background:none; border:none; font-size:1.5em; cursor:pointer;">×</button>
                </div>
                
                <div id="chat-messages" class="chat-messages" style="flex:1; overflow-y:auto; padding:10px; height: 300px;">
                    <div class="message bot">
                        <div class="bubble" style="background:#eee; padding:8px 12px; border-radius:15px; display:inline-block;">
                            반갑다. 나는 ${charName}이다.
                        </div>
                    </div>
                </div>

                <div class="chat-input-area" style="padding:10px; display:flex; gap:5px;">
                    <input type="text" id="chat-input" placeholder="말을 걸어보세요..." autocomplete="off" style="flex:1; padding:8px;">
                    <button id="real-send-btn" style="padding:8px 15px;">전송</button>
                </div>
            `;

            // ... 이벤트 리스너들은 그대로 유지 ...
            document.getElementById('chat-close-btn').addEventListener('click', () => {
                document.getElementById('chat-modal').classList.add('hidden');
                document.getElementById('chat-modal').style.display = 'none';
            });

            const sendBtn = document.getElementById('real-send-btn');
            const input = document.getElementById('chat-input');

            const handleSend = () => {
                const msg = input.value.trim();
                if(!msg) return;
                sendChatMessage(msg, movieId, charName); 
                input.value = '';
            };

            sendBtn.addEventListener('click', handleSend);
            input.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') handleSend();
            });
            
            input.focus();
        }

    // 6-3. 전송 및 API 통신
    async function sendChatMessage(message, movieId, charName) {
        const chatMessages = document.getElementById('chat-messages');
        
        addMessageToUI(chatMessages, message, 'user');

        try {
            const response = await fetch('/api/talk', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    movieId: movieId,
                    characterName: charName,
                    userMessage: message
                })
            });
            const data = await response.json();
            
            if (data.reply) {
                addMessageToUI(chatMessages, data.reply, 'bot');
            } else {
                addMessageToUI(chatMessages, "응답 오류가 발생했습니다.", 'bot');
            }
        } catch (error) {
            console.error(error);
            addMessageToUI(chatMessages, "서버 연결에 실패했습니다.", 'bot');
        }
    }

    function addMessageToUI(container, text, sender) {
        const div = document.createElement('div');
        div.className = `message ${sender}`;
        
        // 간단한 스타일 (CSS 파일이 없을 경우를 대비)
        const bubbleStyle = sender === 'user' 
            ? 'background:#007bff; color:white; padding:8px 12px; border-radius:15px; float:right; clear:both; margin-bottom:5px;' 
            : 'background:#eee; color:black; padding:8px 12px; border-radius:15px; float:left; clear:both; margin-bottom:5px;';
            
        div.innerHTML = `<div class="bubble" style="${bubbleStyle}">${text}</div>`;
        container.appendChild(div);
        container.scrollTop = container.scrollHeight;
    }
    
    // 모달 배경 클릭 닫기
    const chatModal = document.getElementById('chat-modal');
    window.addEventListener('click', (e) => {
        if (e.target === chatModal) {
            chatModal.classList.add('hidden');
            chatModal.style.display = 'none';
        }
    });
});