const API_URL = 'https://moviebox-api-efcn.onrender.com';

// Elements
const trendingGrid = document.getElementById('trending-grid');
const searchGrid = document.getElementById('search-grid');
const trendingSection = document.getElementById('trending-section');
const searchSection = document.getElementById('search-section');
const searchInput = document.getElementById('searchInput');
const searchBtn = document.getElementById('searchBtn');

const playerModal = document.getElementById('playerModal');
const closeModalBtn = document.getElementById('closeModal');
const videoPlayer = document.getElementById('videoPlayer');
const modalTitle = document.getElementById('modalTitle');
const modalBadges = document.getElementById('modalBadges');
const modalDesc = document.getElementById('modalDesc');
const playerLoader = document.getElementById('playerLoader');
const loaderText = document.getElementById('loaderText');
const episodesContainer = document.getElementById('episodesContainer');
const episodesList = document.getElementById('episodesList');

let hls = null;
let player = null;
let currentSubjectId = null;
let currentSlug = null;

// Initialization
document.addEventListener('DOMContentLoaded', async () => {
    try {
        const statusRes = await fetch(`${API_URL}/api/status`);
        const statusData = await statusRes.json();
        if (statusData.maintenance) {
            document.getElementById('maintenanceOverlay').classList.remove('hidden');
            document.querySelector('.content-wrapper').style.display = 'none';
            return; // Stop loading the app
        }
    } catch (e) {
        console.error("Could not check status", e);
    }

    // Initialize Plyr
    player = new Plyr('#videoPlayer', {
        controls: getPlayerControls(),
        settings: ['quality', 'speed'],
        ratio: '16:9'
    });
    
    fetchTrending();
    // Restore state from hash if present
    const hash = window.location.hash;
    if (hash.startsWith('#movie/')) {
        const slug = hash.replace('#movie/', '');
        openMovie(slug);
    }
});

// Anti-Inspect Security Measures
document.addEventListener('contextmenu', e => e.preventDefault());
document.addEventListener('keydown', e => {
    // Block F12
    if (e.key === 'F12') e.preventDefault();
    // Block Ctrl+Shift+I / Cmd+Opt+I (DevTools)
    if ((e.ctrlKey || e.metaKey) && (e.shiftKey || e.altKey) && e.key.toLowerCase() === 'i') e.preventDefault();
    // Block Ctrl+U / Cmd+U (View Source)
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'u') e.preventDefault();
});

// Helper for dynamic Plyr controls
function getPlayerControls() {
    if (window.innerWidth <= 768) {
        return ['play-large', 'play', 'progress', 'current-time', 'duration', 'mute', 'settings', 'fullscreen']; // No volume slider
    }
    return ['play-large', 'play', 'progress', 'current-time', 'duration', 'mute', 'volume', 'captions', 'settings', 'pip', 'airplay', 'fullscreen'];
}

// Create Movie Card HTML
function createMovieCard(item) {
    const card = document.createElement('div');
    card.className = 'movie-card';
    
    let posterContent = '';
    if (item.poster_url) {
        posterContent = `<img src="${item.poster_url}" alt="${item.name}" class="poster" onerror="this.onerror=null;this.parentElement.innerHTML='<div class=\\'fallback-poster\\'><i class=\\'fas fa-film\\'></i></div>';">`;
    } else {
        posterContent = `<div class="fallback-poster"><i class="fas fa-film"></i></div>`;
    }

    const badgeHTML = item.badge ? `<span class="movie-badge">${item.badge}</span>` : '';

    card.innerHTML = `
        ${posterContent}
        <div class="movie-info">
            <h3 class="movie-title">${item.name || item.title || 'Unknown Title'}</h3>
            ${badgeHTML}
        </div>
    `;

    card.addEventListener('click', () => openMovie(item.slug));
    return card;
}

// Fetch Trending
async function fetchTrending() {
    try {
        const response = await fetch(`${API_URL}/home`);
        if (!response.ok) throw new Error('API Error');
        const data = await response.json();
        
        // Find trending section
        let trendingItems = [];
        data.sections.forEach(sec => {
            if (sec.section.toLowerCase().includes('trending') || sec.section.toLowerCase().includes('banner') || sec.section.toLowerCase().includes('hot')) {
                trendingItems = [...trendingItems, ...sec.items];
            }
        });
        
        // Remove duplicates and limit
        const uniqueItems = Array.from(new Map(trendingItems.map(item => [item.subject_id, item])).values()).slice(0, 18);
        
        document.getElementById('trendingLoader').classList.add('hidden');
        trendingGrid.classList.remove('hidden');
        trendingGrid.innerHTML = '';
        uniqueItems.forEach(item => {
            trendingGrid.appendChild(createMovieCard(item));
        });
    } catch (error) {
        console.error('Error fetching trending:', error);
        trendingGrid.innerHTML = '<p>Could not load trending items. Is the API server running?</p>';
    }
}

// Search
async function performSearch() {
    const query = searchInput.value.trim();
    if (!query) {
        searchSection.classList.add('hidden');
        trendingSection.classList.remove('hidden');
        return;
    }

    trendingSection.classList.add('hidden');
    searchSection.classList.remove('hidden');
    searchGrid.innerHTML = '<div class="spinner"></div>';

    try {
        const response = await fetch(`${API_URL}/search?q=${encodeURIComponent(query)}`);
        const data = await response.json();
        
        searchGrid.innerHTML = '';
        if (data.items && data.items.length > 0) {
            data.items.forEach(item => {
                searchGrid.appendChild(createMovieCard(item));
            });
        } else {
            searchGrid.innerHTML = '<p>No results found.</p>';
        }
    } catch (error) {
        console.error('Search error:', error);
        searchGrid.innerHTML = '<p>Search failed.</p>';
    }
}

searchBtn.addEventListener('click', performSearch);
let searchTimeout = null;
searchInput.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(performSearch, 500);
});

// Helper for saving/restoring video progress
function attachProgressTracker(subjectId, se, ep) {
    const key = `progress_${subjectId}_${se}_${ep}`;
    const saved = localStorage.getItem(key);
    
    if (saved) {
        player.once('canplay', () => {
            player.currentTime = parseFloat(saved);
        });
    }
    
    player.on('timeupdate', () => {
        if (player.currentTime > 5) {
            localStorage.setItem(key, player.currentTime);
        }
    });
}

// Open Movie/Series Details
async function openMovie(slug) {
    if(!slug) return;
    
    // Update URL hash to preserve state on refresh
    window.location.hash = 'movie/' + slug;
    
    playerModal.style.display = 'block';
    
    // Add small delay to trigger CSS transition
    setTimeout(() => {
        playerModal.classList.add('show');
    }, 10);
    
    document.body.style.overflow = 'hidden';
    document.getElementById('playerLoader').classList.remove('hidden');
    episodesContainer.classList.add('hidden');
    
    // Clear old data
    modalTitle.textContent = 'Loading...';
    modalDesc.textContent = '';
    modalBadges.innerHTML = '';
    videoPlayer.src = '';
    if (hls) {
        hls.destroy();
        hls = null;
    }

    currentSlug = slug;

    try {
        const res = await fetch(`${API_URL}/detail/${slug}`);
        const result = await res.json();
        const data = result.data || {};
        const subject = data.subject || {};
        
        currentSubjectId = subject.subjectId;
        document.getElementById('modalTitle').textContent = subject.title || 'Unknown Title';
        document.getElementById('modalDesc').innerHTML = subject.description || 'No description available.';
        
        let badgesHTML = '';
        if(subject.releaseDate) badgesHTML += `<span class="movie-badge" style="margin-right:10px;">${subject.releaseDate.substring(0,4)}</span>`;
        document.getElementById('modalBadges').innerHTML = badgesHTML;

        if (subject.imdbRatingValue) {
            document.getElementById('modalRatingBox').style.display = 'block';
            document.getElementById('modalRating').textContent = subject.imdbRatingValue;
        } else {
            document.getElementById('modalRatingBox').style.display = 'none';
        }

        // Check if TV series (has episodes)
        let maxEp = 0;
        let se = 0;
        if (data.resource && data.resource.seasons && data.resource.seasons.length > 0) {
            maxEp = data.resource.seasons[0].maxEp;
            se = data.resource.seasons[0].se;
        }

        if (maxEp > 0) {
            episodesContainer.style.display = ''; // Clear inline display if any
            episodesContainer.classList.remove('hidden');
            renderEpisodes(maxEp);
            playStream(currentSubjectId, slug, se || 1, 1); // Play season 1, ep 1 by default
        } else {
            episodesContainer.classList.add('hidden');
            playStream(currentSubjectId, slug, 0, 0);
        }

    } catch (error) {
        console.error(error);
        loaderText.textContent = 'Failed to load details.';
    }
}

function renderEpisodes(count) {
    const episodesList = document.getElementById('episodesList');
    episodesList.innerHTML = '';
    for(let i=1; i<=count; i++) {
        const btn = document.createElement('button');
        btn.className = 'episode-btn';
        btn.setAttribute('data-ep', i);
        btn.textContent = i < 10 ? `0${i}` : i;
        
        if(i === 1) {
            btn.classList.add('active');
        }
        
        btn.addEventListener('click', () => {
            document.querySelectorAll('.episode-btn').forEach(b => {
                b.classList.remove('active');
            });
            btn.classList.add('active');
            playStream(currentSubjectId, currentSlug, 1, i); // Assuming Season 1 for now
        });
        
        episodesList.appendChild(btn);
    }
}

async function playStream(subjectId, slug, se=1, ep=1) {
    document.getElementById('playerLoader').classList.remove('hidden');
    
    if (hls) {
        hls.destroy();
        hls = null;
    }
    
    // Stop current playback to prepare for new stream
    if (player) {
        player.destroy();
    }

    try {
        const apiRes = await fetch(`${API_URL}/api/stream/${subjectId}?detail_path=${slug}&se=${se}&ep=${ep}`);
        const apiPayload = await apiRes.json();
        
        if (!apiPayload.play_url) {
            throw new Error('No stream available.');
        }

        const WORKER_URL = "https://moviebox-proxies.protikabir.workers.dev/";
        const workerRes = await fetch(`${WORKER_URL}?url=${encodeURIComponent(apiPayload.play_url)}&referer=${encodeURIComponent(apiPayload.player_referer)}`);
        const rawData = await workerRes.json();
        
        const data = {
            has_resource: rawData.data && rawData.data.hasResource,
            sources: (rawData.data && rawData.data.streams || []).map(s => ({
                resolution: s.resolutions + "p",
                url: s.url
            })),
            hls: rawData.data && rawData.data.hls || []
        };

        if (!data.has_resource) {
            throw new Error('No stream available.');
        }

        document.getElementById('playerLoader').classList.add('hidden');

        // Check for MP4 sources first
        if (data.sources && data.sources.length > 0) {
            const validSources = data.sources.filter(s => s.url);
            if (validSources.length > 0) {
                document.getElementById('streamFormat').textContent = 'High efficiency (MP4/H.264)';
                
                const video = document.getElementById('videoPlayer');
                let sourcesHtml = '';
                
                // Sort descending so highest quality is first
                validSources.sort((a,b) => {
                    const qa = parseInt(a.resolution) || 0;
                    const qb = parseInt(b.resolution) || 0;
                    return qb - qa;
                });
                
                validSources.forEach((s) => {
                    const qualityNum = parseInt(s.resolution.replace('p', '')) || 720;
                    const proxiedUrl = `${WORKER_URL}?url=${encodeURIComponent(s.url)}&referer=${encodeURIComponent(apiPayload.player_referer)}`;
                    sourcesHtml += `<source src="${proxiedUrl}" type="video/mp4" size="${qualityNum}">`;
                });
                
                video.innerHTML = sourcesHtml;
                
                player = new Plyr(video, {
                    controls: getPlayerControls(),
                    settings: ['quality', 'speed'],
                    ratio: '16:9',
                    quality: { default: parseInt(validSources[0].resolution) || 720, options: [4320, 2880, 2160, 1440, 1080, 720, 576, 480, 360, 240] }
                });
                
                attachProgressTracker(subjectId, se, ep);
                player.play();
                return;
            }
        }

        // Fallback to HLS
        if (data.hls && data.hls.length > 0) {
            const hlsUrl = data.hls[0];
            const streamUrl = `${WORKER_URL}?url=${encodeURIComponent(hlsUrl)}&referer=${encodeURIComponent(apiPayload.player_referer)}`;
            document.getElementById('streamFormat').textContent = 'Adaptive Quality (HLS)';

            const video = document.getElementById('videoPlayer');
            video.innerHTML = '';
            
            player = new Plyr(video, {
                controls: getPlayerControls(),
                settings: ['quality', 'speed'],
                ratio: '16:9'
            });

            if (Hls.isSupported()) {
                hls = new Hls();
                hls.loadSource(streamUrl);
                hls.attachMedia(video);
                hls.on(Hls.Events.MANIFEST_PARSED, function() {
                    attachProgressTracker(subjectId, se, ep);
                    player.play();
                });
            } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
                video.src = proxiedStreamUrl;
                video.addEventListener('loadedmetadata', function() {
                    attachProgressTracker(subjectId, se, ep);
                    player.play();
                });
            }
            return;
        }

        throw new Error('Could not find stream URL.');

    } catch (error) {
        console.error(error);
        loaderText.textContent = error.message || 'Stream failed.';
        setTimeout(() => { playerLoader.style.display = 'none'; }, 3000);
    }
}

// Global Go Home
function goHome() {
    // Clear hash without triggering scroll jump
    history.pushState("", document.title, window.location.pathname + window.location.search);
    
    searchInput.value = '';
    searchSection.classList.add('hidden');
    trendingSection.classList.remove('hidden');
    playerModal.classList.remove('show');
    
    setTimeout(() => {
        playerModal.style.display = 'none';
        document.body.style.overflow = 'auto';
        if (player) {
            player.destroy();
            player = null;
        }
        if (hls) {
            hls.destroy();
            hls = null;
        }
        document.getElementById('videoPlayer').src = '';
    }, 500); // Wait for transition
}

document.getElementById('logoBtn').addEventListener('click', goHome);
closeModalBtn.addEventListener('click', goHome);

// Close modal on outside click
window.addEventListener('click', (e) => {
    if (e.target == playerModal) {
        closeModalBtn.click();
    }
});
