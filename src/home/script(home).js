import { auth, getUserProfile, signOut } from '../firebase.js';

document.addEventListener('DOMContentLoaded', () => {
    const loginSection = document.getElementById('login-section');
    const profileSection  = document.getElementById('profile-section');
    const nicknameContainer = document.getElementById('nickname-container');
    const logoutButton = document.getElementById('logout-button');

    // 로그인/로그아웃 로직 
    auth.onAuthStateChanged(async (user) => {
        if(user) {
            // --- 로그인한 경우 ---
            console.log('로그인 상태입니다.', user.uid);
            const userProfile = await getUserProfile(user.uid);
            if(loginSection) loginSection.style.display = 'none';
            if(profileSection) profileSection.style.display = 'flex';
            if (userProfile) {
                if(nicknameContainer) nicknameContainer.textContent = `${userProfile.nickname}님`;
            } else {
                if(nicknameContainer) nicknameContainer.innerHTML= '프로필 없음';
            }
            if (logoutButton) {
                logoutButton.addEventListener('click', () => {
                    console.log('로그아웃 되었습니다.');
                    signOut(auth).then(() => {
                        window.location.href = '/'; // 홈으로 이동
                    }).catch((error) => {
                        console.error('Logout error:', error);
                        alert('로그아웃 중 오류가 발생했습니다. 다시 시도해 주세요.');
                    }); 
                });
            }
        } else {
            // ---  로그아웃한 경우 ---
            console.log('로그아웃 상태입니다.');
            if(loginSection) loginSection.style.display = 'block';
            if(profileSection) profileSection.style.display = 'none';
        }
    });
    // 로그인/로그아웃 로직 끝 


    const SERVER_API_URL = '/api/search';

    /**
     * '내 서버'(/api/search)에 영화 데이터를 요청하는 함수
     * @param {Object} params - 서버에 전달할 쿼리 파라미터 (예: { genre: '스릴러' })
     */
    async function fetchMoviesFromServer(params) {
        try {
            // URLSearchParams를 사용해 쿼리 스트링 자동 생성
            // (예: { sort: 'prodYear,1' } => 'sort=prodYear%2C1')
            const queryParams = new URLSearchParams(params);
            const response = await fetch(`${SERVER_API_URL}?${queryParams.toString()}`);
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const movies = await response.json();
            return movies;

        } catch (error) {
            console.error('Failed to fetch movies from server:', error);
            return []; // 오류 발생 시 빈 배열 반환
        }
    }

    function shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    }

    /**
     * 영화 데이터를 받아 HTML 카드를 생성하고 슬라이더에 삽입
     * @param {HTMLElement} wrapper - 카드가 삽입될 .movie-list-wrapper 요소
     * @param {Array} movies - 서버로부터 받은 영화 목록
     */
    function displayMovies(wrapper, movies) {
        wrapper.innerHTML = ''; // 화면 비우기

        // 1. movies 데이터 자체가 없는 경우 처리
        if (!movies || !Array.isArray(movies) || movies.length === 0) {
            wrapper.innerHTML = '<p style="padding: 20px; color: #888;">표시할 영화 데이터가 없습니다.</p>';
            return;
        }

        movies.forEach(movie => {
            try {
                // --- 데이터 안전 처리 시작 ---
                
                // 제목이 없을 경우를 대비해 기본값 설정
                let title = (movie.title || '제목 없음').replace(/!HS|!HE/g, '').trim();

                // 포스터 처리 (데이터가 없거나, null이거나, 비어있을 때 완벽 방어)
                let posterUrl = '/src/public/image/no_image.jpeg'; // 기본 이미지 경로 (경로 확인 필요)
                
                // posters 데이터가 확실히 문자열로 존재할 때만 처리
                if (movie.posters && typeof movie.posters === 'string' && movie.posters.trim() !== '') {
                    // 파이프(|)로 쪼개고 첫 번째 주소 가져오기
                    const splitPosters = movie.posters.split('|');
                    if (splitPosters.length > 0 && splitPosters[0].trim() !== '') {
                        posterUrl = splitPosters[0].trim();
                    }
                }

                // --- HTML 생성 ---
                const cardHtml = `
                    <div class="movie-card">
                        <a href="#">
                            <img src="${posterUrl}" 
                                alt="${title}"
                                onerror="this.onerror=null; this.src='/src/public/image/no_image.jpeg';"
                            >
                            <p class="movie-title">${title}</p>
                        </a>
                    </div>
                `;
                
                wrapper.insertAdjacentHTML('beforeend', cardHtml);

            } catch (error) {
                // 특정 영화 데이터가 이상해도 멈추지 않고 에러만 기록 후 다음 영화로 넘어감
                console.error('영화 데이터 처리 중 오류 발생:', movie, error);
            }
        });
    }

    /**
     * 슬라이더 기능을 설정하는 함수 (여러 슬라이더 지원)
     * @param {HTMLElement} sectionElement - 슬라이더를 포함하는 섹션 요소 (예: #recent-movies-section)
     */
    function setupSlider(sectionElement) {
        const container = sectionElement.querySelector('.slider-container');
        // container가 없는 섹션이면(오류 방지) 함수 종료
        if (!container) return; 

        const frame = container.querySelector('.slider-frame');
        const wrapper = container.querySelector('.movie-list-wrapper');
        const prevBtn = container.querySelector('.prev-arrow');
        const nextBtn = container.querySelector('.next-arrow');
        
        let currentOffset = 0; // 현재 슬라이드 위치 (translateX 값)
        
        // 슬라이더 상태 업데이트 함수
        function updateSlider() {
            // 카드가 없으면(데이터 로딩 실패 등) 버튼 숨기고 중단
            const cardCount = wrapper.querySelectorAll('.movie-card').length;
            if (cardCount === 0) {
                prevBtn.style.display = 'none';
                nextBtn.style.display = 'none';
                return;
            }

            // 슬라이드 가능한 최대 너비
            // (전체 너비 - 눈에 보이는 프레임 너비)
            const maxOffset = wrapper.scrollWidth - frame.clientWidth;

            if (currentOffset > 0) currentOffset = 0; // 왼쪽 끝
            // (중요) maxOffset이 0보다 작으면(카드가 프레임보다 적음) currentOffset도 0
            if (currentOffset < -maxOffset || maxOffset <= 0) {
                currentOffset = (maxOffset <= 0) ? 0 : -maxOffset; // 오른쪽 끝
            }
            
            wrapper.style.transform = `translateX(${currentOffset}px)`;
            
            // 버튼 표시/숨김
            prevBtn.style.display = (currentOffset === 0) ? 'none' : 'block';
            nextBtn.style.display = (currentOffset <= -maxOffset || maxOffset <= 0) ? 'none' : 'block';
        }

        nextBtn.addEventListener('click', () => {
            currentOffset -= frame.clientWidth; // 프레임 너비만큼 이동
            updateSlider();
        });

        prevBtn.addEventListener('click', () => {
            currentOffset += frame.clientWidth;
            updateSlider();
        });

        // (중요) 창 크기가 바뀔 때 슬라이더가 깨지는 것을 방지
        // (슬라이드 위치를 리셋하고 버튼 상태를 다시 계산)
        window.addEventListener('resize', () => {
            currentOffset = 0; 
            updateSlider();
        });

        updateSlider(); // 초기 상태 업데이트
    }

    // --- (실행 1) '영화 둘러보기' 섹션 초기화 ---
    async function initRecentMovies() {
        const section = document.getElementById('recent-movies-section');
        if (!section) return; // 해당 섹션이 없으면 종료

        const wrapper = section.querySelector('.movie-list-wrapper');
        wrapper.innerHTML = '<p style="padding: 20px; color: #888;">영화 로딩 중...</p>';
        
        // '내 서버'에 최신순(prodYear,1) + 2023년 이후 개봉작 요청
        const movies = await fetchMoviesFromServer({ 
            sort: 'prodYear,1', 
            listCount: 50,
            releaseDts: '20230101',
        });

        if (movies && Array.isArray(movies)) {
            shuffleArray(movies);
        }


        
        displayMovies(wrapper, movies); // 영화 카드 표시
        setupSlider(section); // 슬라이더 기능 적용
    }

    // --- '장르별 보기' 섹션 초기화 ---
    async function initGenreMovies() {
        const section = document.getElementById('genre-movies-section');
        if (!section) return; // 해당 섹션이 없으면 종료

        const tabs = section.querySelectorAll('.tab-button');
        const wrapper = section.querySelector('.movie-list-wrapper');

        // 장르별 영화 불러오는 내부 함수
        async function loadMoviesByGenre(genre) {
            wrapper.innerHTML = '<p style="padding: 20px; color: #888;">로딩 중...</p>';
            
            // '내 서버'에 장르 + 최신순으로 요청
            const movies = await fetchMoviesFromServer({ 
                genre: genre, 
                sort: 'prodYear,1' 
            });

            if (movies && Array.isArray(movies)) {
                shuffleArray(movies);
            }
            
            displayMovies(wrapper, movies); // 영화 카드 표시
            setupSlider(section); // (중요) 새 카드가 로드될 때마다 슬라이더 재설정
        }

        // 탭 클릭 이벤트 설정
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                // 1. 'active' 클래스 관리
                tabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                
                // 2. data-genre 값으로 영화 로드
                const genre = tab.dataset.genre;
                loadMoviesByGenre(genre);
            });
        });

        // 3. 초기 로드 (첫 번째 탭을 강제로 클릭)
        if (tabs.length > 0) {
            tabs[0].click();
        }
    }

    // --- (실행 3) 페이지 로드 시 두 기능 모두 실행 ---
    initRecentMovies();
    initGenreMovies();

});
