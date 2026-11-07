// ---------- Grab the elements ----------
const searchInput = document.getElementById('searchInput');
const searchBtn = document.getElementById('searchBtn');
const suggestionsList = document.getElementById('suggestions');
const locateBtn = document.getElementById('locateBtn');

const locationName = document.getElementById('locationName');
const tempEl = document.getElementById('temp');
const feelsEl = document.getElementById('feels');
const rangeEl = document.getElementById('range');
const rainEl = document.getElementById('rain');

const forecastList = document.getElementById('forecastList');
const forecastInner = document.getElementById('forecastInner');
const hourlyList = document.getElementById('hourlyList');
const hourlyTitle = document.getElementById('hourlyTitle');
const flipBack = document.getElementById('flipBack');
const dailySummary = document.getElementById('dailySummary');
let lastForecast = null; // keeps the latest forecast so we can show any day's hours

const places = {
    police: { name: document.getElementById('policeName'), dist: document.getElementById('policeDist') },
    clinic: { name: document.getElementById('clinicName'), dist: document.getElementById('clinicDist') },
    fire:   { name: document.getElementById('fireName'),   dist: document.getElementById('fireDist') },
    mall:   { name: document.getElementById('mallName'),   dist: document.getElementById('mallDist') }
};

const live = {
    trafficDetail: document.getElementById('trafficDetail'),
    trafficStatus: document.getElementById('trafficStatus'),
    routeTitle: document.getElementById('routeTitle'),
    routeDetail: document.getElementById('routeDetail'),
    routeStatus: document.getElementById('routeStatus'),
    potholeDetail: document.getElementById('potholeDetail'),
    potholeStatus: document.getElementById('potholeStatus')
};

let debounceTimer;
let activeIndex = -1;
let currentSuggestions = [];

// ---------- 1. Suggestions while typing ----------
searchInput.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    const query = searchInput.value.trim();

    if (query.length < 2) {
        hideSuggestions();
        return;
    }

    // Wait 300ms after the last keystroke so we do not spam the service
    debounceTimer = setTimeout(() => fetchSuggestions(query), 300);
});

async function fetchSuggestions(query) {
    try {
        const url = 'https://geocoding-api.open-meteo.com/v1/search?count=6&language=en&name=' + encodeURIComponent(query);
        const response = await fetch(url);
        const data = await response.json();
        currentSuggestions = data.results || [];
        showSuggestions(currentSuggestions);
    } catch (error) {
        console.error('Suggestion error:', error);
    }
}

function showSuggestions(results) {
    suggestionsList.innerHTML = '';
    activeIndex = -1;

    if (results.length === 0) {
        hideSuggestions();
        return;
    }

    results.forEach((place) => {
        const li = document.createElement('li');
        const region = [place.admin1, place.country].filter(Boolean).join(', ');
        li.innerHTML = '<strong>' + place.name + '</strong><small>' + region + '</small>';
        li.addEventListener('click', () => chooseLocation(place));
        suggestionsList.appendChild(li);
    });

    suggestionsList.classList.add('show');
}

function hideSuggestions() {
    suggestionsList.classList.remove('show');
    suggestionsList.innerHTML = '';
    activeIndex = -1;
}

// ---------- 2. Keyboard and button handling ----------
searchInput.addEventListener('keydown', (event) => {
    const items = suggestionsList.querySelectorAll('li');

    if (event.key === 'ArrowDown' && items.length) {
        event.preventDefault();
        activeIndex = (activeIndex + 1) % items.length;
        highlight(items);
    } else if (event.key === 'ArrowUp' && items.length) {
        event.preventDefault();
        activeIndex = (activeIndex - 1 + items.length) % items.length;
        highlight(items);
    } else if (event.key === 'Enter') {
        event.preventDefault();
        if (activeIndex >= 0 && currentSuggestions[activeIndex]) {
            chooseLocation(currentSuggestions[activeIndex]);
        } else {
            searchTyped();
        }
    } else if (event.key === 'Escape') {
        hideSuggestions();
    }
});

function highlight(items) {
    items.forEach((item, i) => item.classList.toggle('active', i === activeIndex));
}

searchBtn.addEventListener('click', searchTyped);

// Round locate button (only wired up if it exists in your HTML)
if (locateBtn) {
    locateBtn.addEventListener('click', detectLocation);
}

// Close the dropdown when clicking anywhere else
document.addEventListener('click', (event) => {
    if (!event.target.closest('.search-box')) hideSuggestions();
});

// Search whatever is typed, using the first match
async function searchTyped() {
    const query = searchInput.value.trim();
    if (!query) return;

    try {
        const url = 'https://geocoding-api.open-meteo.com/v1/search?count=1&language=en&name=' + encodeURIComponent(query);
        const response = await fetch(url);
        const data = await response.json();

        if (!data.results || data.results.length === 0) {
            alert('Location not found. Try another name.');
            return;
        }
        chooseLocation(data.results[0]);
    } catch (error) {
        alert('Could not search right now. Check your internet connection.');
    }
}

// ---------- 3. A location was chosen: update everything ----------
async function chooseLocation(place) {
    hideSuggestions();

    const region = [place.admin1, place.country].filter(Boolean).join(', ');
    const fullName = place.name + (region ? ', ' + region : '');
    searchInput.value = place.name;

    locationName.textContent = fullName;
    if (live.routeTitle) {
        live.routeTitle.textContent = 'Easiest route from ' + place.name;
    }

    // Move the radar map to the new place
    updateRadar(place.latitude, place.longitude);

    // Run all updates at the same time (each one only once)
    await Promise.all([
        updateWeather(place.latitude, place.longitude),
        updateNearby(place.latitude, place.longitude),
        updateForecast(place.latitude, place.longitude)
    ]);

    updateLiveActivity(place.name);
    animateCards();
}

// ---------- Weather (Open-Meteo, free, no key needed) ----------
async function updateWeather(lat, lon) {
    try {
        const url = 'https://api.open-meteo.com/v1/forecast'
            + '?latitude=' + lat + '&longitude=' + lon
            + '&current=temperature_2m,apparent_temperature,weather_code,is_day'
            + '&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max'
            + '&temperature_unit=celsius&timezone=auto&forecast_days=1';

        const response = await fetch(url);
        const data = await response.json();

        tempEl.textContent = Math.round(data.current.temperature_2m) + '°';
        feelsEl.textContent = 'Feels Like ' + Math.round(data.current.apparent_temperature) + '°';
        rangeEl.textContent = 'High ' + Math.round(data.daily.temperature_2m_max[0])
            + '° | Low ' + Math.round(data.daily.temperature_2m_min[0]) + '°';
        rainEl.textContent = 'Chance of Rain ' + data.daily.precipitation_probability_max[0] + '%';

        // Change the page background to match the current weather
        setWeatherBackground(data.current.weather_code, data.current.is_day === 1);
    } catch (error) {
        console.error('Weather error:', error);
        tempEl.textContent = '--°';
    }
}

// ---------- Nearby places (OpenStreetMap through Overpass) ----------
async function updateNearby(lat, lon) {
    const kinds = {
        police: 'amenity=police',
        clinic: 'amenity~"clinic|hospital|doctors"',
        fire:   'amenity=fire_station',
        mall:   'shop=mall'
    };

    // Show a loading state first
    Object.values(places).forEach((p) => {
        if (!p.name || !p.dist) return; // card or row removed from the HTML
        p.name.textContent = 'Searching...';
        p.dist.textContent = '';
    });

    await Promise.all(Object.keys(kinds).map(async (key) => {
        if (!places[key].name || !places[key].dist) return; // skip rows that do not exist
        try {
            const query = '[out:json][timeout:15];'
                + 'nwr[' + kinds[key] + '](around:10000,' + lat + ',' + lon + ');'
                + 'out center 30;';

            const response = await fetch('https://overpass-api.de/api/interpreter', {
                method: 'POST',
                body: 'data=' + encodeURIComponent(query)
            });
            const data = await response.json();

            let closest = null;
            let shortest = Infinity;

            data.elements.forEach((el) => {
                const elLat = el.lat ?? (el.center && el.center.lat);
                const elLon = el.lon ?? (el.center && el.center.lon);
                if (elLat === undefined || elLon === undefined) return;

                const km = distanceKm(lat, lon, elLat, elLon);
                if (km < shortest) {
                    shortest = km;
                    closest = el;
                }
            });

            if (closest) {
                places[key].name.textContent = (closest.tags && closest.tags.name) || 'Unnamed ' + key;
                places[key].dist.textContent = shortest.toFixed(1) + ' km';
            } else {
                places[key].name.textContent = 'None found within 10 km';
                places[key].dist.textContent = '';
            }
        } catch (error) {
            console.error('Nearby error:', error);
            places[key].name.textContent = 'Could not load';
            places[key].dist.textContent = '';
        }
    }));
}

// Straight-line distance between two coordinates (haversine formula)
function distanceKm(lat1, lon1, lat2, lon2) {
    const toRad = (deg) => deg * Math.PI / 180;
    const R = 6371;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2
        + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ---------- 7-day forecast ----------

// Turn Open-Meteo weather codes into an icon and a short label
function weatherInfo(code) {
    if (code === 0) return { icon: '☀️', label: 'Sunny' };
    if (code <= 2) return { icon: '🌤️', label: 'Partly cloudy' };
    if (code === 3) return { icon: '☁️', label: 'Cloudy' };
    if (code <= 48) return { icon: '🌫️', label: 'Foggy' };
    if (code <= 57) return { icon: '🌦️', label: 'Drizzle' };
    if (code <= 67) return { icon: '🌧️', label: 'Rain' };
    if (code <= 77) return { icon: '❄️', label: 'Snow' };
    if (code <= 82) return { icon: '🌧️', label: 'Showers' };
    if (code <= 86) return { icon: '🌨️', label: 'Snow showers' };
    return { icon: '⛈️', label: 'Thunderstorm' };
}

// Pick an outfit tip from the day's numbers (temperatures in Celsius)
function outfitTip(high, low, rainChance, uv, code) {
    const tips = [];

    if (code >= 95) {
        return 'Stormy day. Stay in if you can, or wear a waterproof jacket.';
    }

    if (high >= 30) tips.push('Light, breathable clothes like a t-shirt and shorts');
    else if (high >= 24) tips.push('T-shirt and light pants or a skirt');
    else if (high >= 18) tips.push('Long sleeves or a light jumper');
    else if (high >= 12) tips.push('A warm jacket and long pants');
    else tips.push('Heavy coat, scarf, and warm layers');

    if (low <= 8 && high >= 18) tips.push('bring a jacket for the cold morning and evening');

    if (rainChance >= 50) tips.push('take an umbrella or raincoat');
    else if (rainChance >= 30) tips.push('maybe pack a small umbrella');

    if (uv >= 8) tips.push('wear a hat, sunglasses, and strong sunscreen');
    else if (uv >= 6) tips.push('sunglasses and sunscreen');

    const first = tips[0];
    const rest = tips.slice(1);
    return first + (rest.length ? ', and ' + rest.join(', ') : '') + '.';
}

async function updateForecast(lat, lon) {
    if (!forecastList) {
        console.error('Forecast card not found. Add the HTML with id="forecastList".');
        return;
    }

    // A new search always starts on the front of the card
    if (forecastInner) forecastInner.classList.remove('flipped');

    forecastList.innerHTML = '<li class="forecast-loading">Loading forecast...</li>';

    try {
        // Humidity comes from the hourly data, which we average for each day
        const url = 'https://api.open-meteo.com/v1/forecast'
            + '?latitude=' + lat + '&longitude=' + lon
            + '&daily=weather_code,temperature_2m_max,temperature_2m_min,'
            + 'precipitation_probability_max,uv_index_max,precipitation_sum,'
            + 'wind_speed_10m_max,wind_direction_10m_dominant,sunrise,sunset'
            + '&hourly=relative_humidity_2m,temperature_2m,weather_code,precipitation_probability,'
            + 'wind_speed_10m,wind_direction_10m,uv_index'
            + '&temperature_unit=celsius&timezone=auto&forecast_days=7';

        const response = await fetch(url);
        const data = await response.json();

        if (!data.daily) {
            throw new Error(data.reason || 'No daily forecast data returned');
        }

        lastForecast = data;

        const d = data.daily;
        const h = data.hourly;

        // Average the 24 hourly humidity values that belong to one day
        const averageHumidity = (dayString) => {
            if (!h) return 0;
            let sum = 0;
            let count = 0;
            h.time.forEach((t, idx) => {
                const value = h.relative_humidity_2m[idx];
                if (t.startsWith(dayString) && value !== null && value !== undefined) {
                    sum += value;
                    count++;
                }
            });
            return count ? Math.round(sum / count) : 0;
        };

        forecastList.innerHTML = '';

        for (let i = 0; i < d.time.length; i++) {
            const date = new Date(d.time[i] + 'T12:00:00');
            const dayName = i === 0 ? 'Today'
                : date.toLocaleDateString('en-ZA', { weekday: 'long' });
            const dateText = date.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' });

            const info = weatherInfo(d.weather_code[i]);
            const high = Math.round(d.temperature_2m_max[i]);
            const low = Math.round(d.temperature_2m_min[i]);
            const rain = d.precipitation_probability_max[i] ?? 0;
            const uv = Math.round(d.uv_index_max[i] ?? 0);
            const humidity = averageHumidity(d.time[i]);
            const tip = outfitTip(high, low, rain, uv, d.weather_code[i]);

            const li = document.createElement('li');
            li.innerHTML =
                '<div class="day-name">' + dayName + '<small>' + dateText + '</small></div>'
                + '<span class="day-icon">' + info.icon + '</span>'
                + '<div class="day-temps">' + high + '° <span>' + low + '°</span></div>'
                + '<small>' + info.label + '</small>'
                + '<div class="day-stats">'
                +   '<span>🌧️ Rain ' + rain + '%</span>'
                +   '<span>💧 Humidity ' + humidity + '%</span>'
                +   '<span>☀️ UV ' + uv + '</span>'
                + '</div>'
                + '<div class="outfit">👕 ' + tip + '</div>';

            // Clicking a day flips the card to that day's hourly view
            const dayKey = d.time[i];
            li.classList.add('clickable');
            li.title = 'Tap to see the hourly temperature';
            li.addEventListener('click', () => showHourly(dayKey, dayName + ', ' + dateText, i));

            forecastList.appendChild(li);
        }

        setFlipHeight(false); // size the card to the front side
    } catch (error) {
        console.error('Forecast error:', error);
        forecastList.innerHTML = '<li class="forecast-loading">Could not load the forecast.</li>';
        setFlipHeight(false);
    }
}

// ---------- Hourly view (the back of the flip card) ----------

function uvLabel(uv) {
    if (uv >= 11) return 'Extreme';
    if (uv >= 8) return 'Very high';
    if (uv >= 6) return 'High';
    if (uv >= 3) return 'Moderate';
    return 'Low';
}

// Turn wind degrees into a compass direction (the direction the wind comes FROM)
function compass(degrees) {
    const points = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
                    'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    return points[Math.round(degrees / 22.5) % 16];
}

// The card is as tall as whichever side is showing, so it never leaves a gap
function setFlipHeight(showBack) {
    if (!forecastInner) return;
    const face = forecastInner.querySelector(showBack ? '.forecast-back' : '.forecast-front');
    if (face) forecastInner.style.height = face.offsetHeight + 'px';
}

// One readable sentence that sums up the day
function daySummaryText(info, high, low, rain, rainMm, uv, windMax, windDir) {
    const parts = [];
    parts.push(info.label + ' with a high of ' + high + '° and a low of ' + low + '°.');

    if (rain >= 60) parts.push('Rain is likely (' + rain + '%), about ' + rainMm.toFixed(1) + ' mm expected.');
    else if (rain >= 30) parts.push('There is a ' + rain + '% chance of rain.');
    else parts.push('Rain is unlikely (' + rain + '%).');

    parts.push('UV peaks at ' + uv + ' (' + uvLabel(uv).toLowerCase() + ')'
        + (uv >= 6 ? ', so wear sunscreen' : '') + '.');
    parts.push('Winds up to ' + windMax + ' km/h from the ' + compass(windDir) + '.');

    return parts.join(' ');
}

// Fill the daily summary panel at the top of the back side
function renderDailySummary(i) {
    if (!dailySummary) return;

    const d = lastForecast.daily;
    const info = weatherInfo(d.weather_code[i]);
    const high = Math.round(d.temperature_2m_max[i]);
    const low = Math.round(d.temperature_2m_min[i]);
    const rain = d.precipitation_probability_max[i] ?? 0;
    const rainMm = d.precipitation_sum ? (d.precipitation_sum[i] ?? 0) : 0;
    const uv = Math.round(d.uv_index_max[i] ?? 0);
    const windMax = Math.round(d.wind_speed_10m_max[i] ?? 0);
    const windDir = d.wind_direction_10m_dominant[i] ?? 0;
    const sunrise = d.sunrise[i].slice(11, 16);
    const sunset = d.sunset[i].slice(11, 16);

    const stat = (label, value) =>
        '<div class="stat"><small>' + label + '</small><strong>' + value + '</strong></div>';

    dailySummary.innerHTML =
        '<div class="summary-top">'
        +   '<span class="summary-icon">' + info.icon + '</span>'
        +   '<div>'
        +     '<div class="summary-label">Daily summary</div>'
        +     '<div class="summary-text">'
        +       daySummaryText(info, high, low, rain, rainMm, uv, windMax, windDir)
        +     '</div>'
        +   '</div>'
        + '</div>'
        + '<div class="summary-stats">'
        +   stat('High / Low', high + '° / ' + low + '°')
        +   stat('Rain', rain + '%' + (rainMm ? ' · ' + rainMm.toFixed(1) + ' mm' : ''))
        +   stat('UV peak', uv + ' ' + uvLabel(uv))
        +   stat('Wind', windMax + ' km/h ' + compass(windDir))
        +   stat('Sunrise', sunrise)
        +   stat('Sunset', sunset)
        + '</div>';
}

function showHourly(dayString, dayLabel, dayIndex) {
    if (!lastForecast || !lastForecast.hourly || !hourlyList || !forecastInner) return;

    const h = lastForecast.hourly;

    // Find the hourly entries that belong to the chosen day
    const indexes = [];
    h.time.forEach((t, idx) => {
        if (t.startsWith(dayString)) indexes.push(idx);
    });

    const temps = indexes.map((idx) => h.temperature_2m[idx]);
    const min = Math.min(...temps);
    const max = Math.max(...temps);

    hourlyTitle.textContent = dayLabel;
    renderDailySummary(dayIndex);
    hourlyList.innerHTML = '';

    indexes.forEach((idx) => {
        const hour = h.time[idx].slice(11, 16);           // "14:00"
        const temp = Math.round(h.temperature_2m[idx]);
        const info = weatherInfo(h.weather_code[idx]);
        const rain = h.precipitation_probability[idx] ?? 0;
        const windSpeed = Math.round(h.wind_speed_10m[idx] ?? 0);
        const windDir = h.wind_direction_10m[idx] ?? 0;
        const hourUv = Math.round(h.uv_index[idx] ?? 0);

        // Bar height between 20px and 70px, taller means warmer
        const barHeight = max === min ? 45 : 20 + ((h.temperature_2m[idx] - min) / (max - min)) * 50;

        const li = document.createElement('li');
        li.innerHTML =
            '<div class="hour-time">' + hour + '</div>'
            + '<div class="hour-icon">' + info.icon + '</div>'
            + '<div class="hour-bar-wrap"><div class="hour-bar" style="height:' + barHeight + 'px"></div></div>'
            + '<div class="hour-temp">' + temp + '°</div>'
            + '<div class="hour-rain">🌧️ ' + rain + '%</div>'
            + '<div class="hour-wind">'
            +   '<span class="wind-arrow" style="transform: rotate(' + (windDir + 180) + 'deg)">↑</span>'
            +   '<span>' + windSpeed + ' km/h</span>'
            +   '<span>' + compass(windDir) + '</span>'
            + '</div>'
            + '<div class="hour-uv">UV ' + hourUv + '</div>';
        hourlyList.appendChild(li);
    });

    hourlyList.scrollLeft = 0;
    setFlipHeight(true);
    forecastInner.classList.add('flipped');
}

if (flipBack && forecastInner) {
    flipBack.addEventListener('click', () => {
        setFlipHeight(false);
        forecastInner.classList.remove('flipped');
    });

    // Keep the card the right height if the window is resized or the phone is rotated
    window.addEventListener('resize', () => {
        setFlipHeight(forecastInner.classList.contains('flipped'));
    });
}

// ---------- Weather background and effects ----------
// Two fixed layers behind the page: one for the background, one for rain, snow, etc.
const bgWrap = document.createElement('div');
bgWrap.className = 'weather-bg-wrap';
const fxWrap = document.createElement('div');
fxWrap.className = 'weather-fx';
document.body.prepend(bgWrap, fxWrap);

let currentTheme = '';

const rand = (min, max) => Math.random() * (max - min) + min;

// Turn Open-Meteo weather codes into a background theme
function themeFor(code, isDay) {
    if (code >= 95) return 'storm';
    if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
    if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return 'rain';
    if (code === 45 || code === 48) return 'fog';
    if (code === 3) return 'cloudy';
    if (code === 2) return isDay ? 'partly' : 'partly-night';
    return isDay ? 'sunny' : 'night';
}

// Create many small elements (raindrops, snowflakes, stars, clouds)
function addParticles(count, className, styleFn) {
    for (let i = 0; i < count; i++) {
        const el = document.createElement('span');
        el.className = className;
        styleFn(el);
        fxWrap.appendChild(el);
    }
}

function buildEffects(theme) {
    fxWrap.innerHTML = '';

    // Clouds drift across the sky for any cloudy kind of weather
    if (['partly', 'partly-night', 'cloudy', 'rain', 'storm', 'fog'].includes(theme)) {
        const dark = theme === 'rain' || theme === 'storm';
        addParticles(theme === 'fog' ? 7 : 5, 'cloud', (el) => {
            el.style.top = rand(0, 45) + '%';
            el.style.width = rand(200, 380) + 'px';
            el.style.height = rand(60, 120) + 'px';
            el.style.background = dark ? 'rgba(35, 50, 65, 0.6)' : 'rgba(255, 255, 255, 0.45)';
            el.style.animationDuration = rand(60, 120) + 's';
            el.style.animationDelay = '-' + rand(0, 100) + 's'; // start already mid-screen
        });
    }

    // Rain and storms
    if (theme === 'rain' || theme === 'storm') {
        addParticles(theme === 'storm' ? 140 : 90, 'drop', (el) => {
            el.style.left = rand(0, 100) + '%';
            el.style.height = rand(30, 70) + 'px';
            el.style.opacity = rand(0.3, 0.8);
            el.style.animationDuration = rand(0.5, 1) + 's';
            el.style.animationDelay = '-' + rand(0, 2) + 's';
        });
    }

    // Lightning flash for storms
    if (theme === 'storm') {
        const flash = document.createElement('div');
        flash.className = 'lightning';
        fxWrap.appendChild(flash);
    }

    // Snow
    if (theme === 'snow') {
        addParticles(70, 'flake', (el) => {
            const size = rand(3, 8);
            el.style.left = rand(0, 100) + '%';
            el.style.width = size + 'px';
            el.style.height = size + 'px';
            el.style.opacity = rand(0.5, 1);
            el.style.animationDuration = rand(6, 12) + 's';
            el.style.animationDelay = '-' + rand(0, 10) + 's';
        });
    }

    // Sun glow on clear and partly cloudy days
    if (theme === 'sunny' || theme === 'partly') {
        const sun = document.createElement('span');
        sun.className = 'sun';
        fxWrap.appendChild(sun);
    }

    // Twinkling stars at night
    if (theme === 'night' || theme === 'partly-night') {
        addParticles(60, 'star', (el) => {
            const size = rand(1, 3);
            el.style.top = rand(0, 70) + '%';
            el.style.left = rand(0, 100) + '%';
            el.style.width = size + 'px';
            el.style.height = size + 'px';
            el.style.animationDelay = '-' + rand(0, 4) + 's';
        });
    }
}

function setWeatherBackground(code, isDay) {
    const theme = themeFor(code, isDay);
    if (theme === currentTheme) return; // already showing this one
    currentTheme = theme;
    document.body.dataset.weather = theme;

    // Fade the new background in over the old one
    const layer = document.createElement('div');
    layer.className = 'weather-bg theme-' + theme;
    bgWrap.appendChild(layer);
    requestAnimationFrame(() => requestAnimationFrame(() => layer.classList.add('visible')));

    const olderLayers = Array.from(bgWrap.children).filter((el) => el !== layer);
    setTimeout(() => olderLayers.forEach((el) => el.remove()), 1500);

    buildEffects(theme);
}

// ---------- Radar map (Leaflet + RainViewer) ----------
const radarMapEl = document.getElementById('radarMap');
const radarPlay = document.getElementById('radarPlay');
const radarSlider = document.getElementById('radarSlider');
const radarTime = document.getElementById('radarTime');

let radarMap = null;
let radarMarker = null;
let radarHost = '';
let radarFrames = [];      // the past 2 hours of radar images, 10 minutes apart
let radarLayers = {};      // one map layer per frame, created only when needed
let radarIndex = 0;
let radarTimer = null;
let radarPlaying = true;

function initRadar() {
    if (!radarMapEl || !radarPlay || !radarSlider || !radarTime) return; // radar card not in the HTML

    if (typeof L === 'undefined') {
        console.error('Leaflet did not load. Check the two Leaflet lines in your HTML.');
        radarTime.textContent = 'Map library missing';
        return;
    }

    radarMap = L.map(radarMapEl, {
        minZoom: 3,
        maxZoom: 9,
        scrollWheelZoom: false,   // stops the map from hijacking page scrolling
        attributionControl: false
    }).setView([-26.1, 28.23], 7);

    // Base map: OpenStreetMap (no API key needed), darkened with CSS to match your cards
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        className: 'dark-base'
    }).addTo(radarMap);

    // A dot that marks the searched place
    radarMarker = L.circleMarker([-26.1, 28.23], {
        radius: 8,
        color: 'white',
        weight: 3,
        fillColor: '#4a90e2',
        fillOpacity: 1
    }).addTo(radarMap);

    radarPlay.addEventListener('click', () => setRadarPlaying(!radarPlaying));

    radarSlider.addEventListener('input', () => {
        setRadarPlaying(false);
        showRadarFrame(Number(radarSlider.value));
    });

    loadRadarFrames();
    setInterval(loadRadarFrames, 10 * 60 * 1000); // refresh the frame list every 10 minutes
    setTimeout(() => radarMap.invalidateSize(), 500); // fixes the map size once the page settles
}

// Ask RainViewer which radar images are available right now
async function loadRadarFrames() {
    if (!radarMap) return;

    try {
        const response = await fetch('https://api.rainviewer.com/public/weather-maps.json');
        const data = await response.json();

        radarHost = data.host;
        radarFrames = (data.radar && data.radar.past) ? data.radar.past : [];

        // Drop map layers for frames that are no longer available
        const keep = new Set(radarFrames.map((f) => f.time));
        Object.keys(radarLayers).forEach((time) => {
            if (!keep.has(Number(time))) {
                radarMap.removeLayer(radarLayers[time]);
                delete radarLayers[time];
            }
        });

        if (!radarFrames.length) {
            radarTime.textContent = 'No radar data';
            return;
        }

        radarSlider.max = radarFrames.length - 1;
        showRadarFrame(radarFrames.length - 1); // start on the newest frame
        if (radarPlaying) scheduleRadar(1500);
    } catch (error) {
        console.error('Radar error:', error);
        radarTime.textContent = 'Radar unavailable';
    }
}

// Create (once) the map layer for one radar frame
function getRadarLayer(i) {
    const frame = radarFrames[i];

    if (!radarLayers[frame.time]) {
        const layer = L.tileLayer(radarHost + frame.path + '/512/{z}/{x}/{y}/2/1_1.png', {
            tileSize: 512,
            zoomOffset: -1,
            maxNativeZoom: 8,   // RainViewer's free tiles stop at zoom 7 (8 with the 512 offset)
            opacity: 0,
            zIndex: 10 + i
        });
        layer.radarReady = false;
        layer.on('load', () => { layer.radarReady = true; });
        layer.addTo(radarMap);
        radarLayers[frame.time] = layer;
    }

    return radarLayers[frame.time];
}

// Show one frame: fade it in once its tiles have loaded, hide the rest
function showRadarFrame(i) {
    if (!radarMap || !radarFrames.length) return;

    radarIndex = i;
    radarSlider.value = i;

    const frame = radarFrames[i];
    const minutesAgo = Math.max(0, Math.round((Date.now() / 1000 - frame.time) / 60));
    const clock = new Date(frame.time * 1000).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' });
    radarTime.textContent = clock + ' · ' + (minutesAgo < 5 ? 'Now' : minutesAgo + ' min ago');

    const layer = getRadarLayer(i);

    const apply = () => {
        if (radarIndex !== i) return; // the person moved on to another frame
        Object.keys(radarLayers).forEach((time) => {
            radarLayers[time].setOpacity(Number(time) === frame.time ? 0.8 : 0);
        });
    };

    if (layer.radarReady) apply();
    else layer.once('load', apply);
}

// Play and pause
function scheduleRadar(delay) {
    clearTimeout(radarTimer);
    if (radarPlaying) radarTimer = setTimeout(tickRadar, delay);
}

function tickRadar() {
    if (!radarPlaying || !radarFrames.length) return;
    const next = (radarIndex + 1) % radarFrames.length;
    showRadarFrame(next);
    scheduleRadar(next === radarFrames.length - 1 ? 1800 : 700); // linger on the newest frame
}

function setRadarPlaying(playing) {
    radarPlaying = playing;
    radarPlay.innerHTML = playing
        ? '<i class="fa-solid fa-pause"></i>'
        : '<i class="fa-solid fa-play"></i>';

    if (playing) scheduleRadar(500);
    else clearTimeout(radarTimer);
}

// Called whenever a new place is chosen
function updateRadar(lat, lon) {
    if (!radarMap) return;

    // Remove the old layers so we only load tiles for the new area as needed
    Object.keys(radarLayers).forEach((time) => radarMap.removeLayer(radarLayers[time]));
    radarLayers = {};

    radarMap.setView([lat, lon], 7);
    radarMarker.setLatLng([lat, lon]);

    if (radarFrames.length) showRadarFrame(radarIndex);
}

// ---------- Live activity (simulated for now) ----------
function updateLiveActivity(cityName) {
    const trafficOptions = [
        { text: 'Moving freely around ' + cityName, label: 'Clear', css: 'clear' },
        { text: 'Slow moving on main roads in ' + cityName, label: 'Slow', css: 'slow' },
        { text: 'Heavy congestion near ' + cityName + ' centre', label: 'Heavy', css: 'bad' }
    ];
    const routeOptions = [
        { text: 'Via the main highway, about 25 min', label: 'Clear', css: 'clear' },
        { text: 'Via the ring road, about 40 min', label: 'Slow', css: 'slow' }
    ];
    const potholeOptions = [
        { text: 'No major potholes reported in ' + cityName, label: 'OK', css: 'clear' },
        { text: 'A few potholes reported in ' + cityName, label: 'Caution', css: 'slow' },
        { text: 'Large potholes reported near ' + cityName, label: 'Warning', css: 'bad' }
    ];

    const pick = (list) => list[Math.floor(Math.random() * list.length)];

    setLive(live.trafficDetail, live.trafficStatus, pick(trafficOptions));
    setLive(live.routeDetail, live.routeStatus, pick(routeOptions));
    setLive(live.potholeDetail, live.potholeStatus, pick(potholeOptions));
}

function setLive(detailEl, statusEl, option) {
    if (!detailEl || !statusEl) return; // card or row removed from the HTML
    detailEl.textContent = option.text;
    statusEl.textContent = option.label;
    statusEl.className = 'status ' + option.css;
}

// ---------- Small fade animation on all cards ----------
function animateCards() {
    document.querySelectorAll('.weather-card, .forecast-card, .places-card, .live-card').forEach((card) => {
        card.classList.remove('fade-update');
        void card.offsetWidth; // restarts the animation
        card.classList.add('fade-update');
    });
}

// ---------- Detect the visitor's location ----------
function detectLocation() {
    if (!navigator.geolocation) {
        loadDefaultLocation('Location not supported');
        return;
    }

    locationName.textContent = 'Finding your location...';

    navigator.geolocation.getCurrentPosition(
        async (position) => {
            const lat = position.coords.latitude;
            const lon = position.coords.longitude;

            const place = await reverseGeocode(lat, lon);
            await chooseLocation(place);
            searchInput.value = ''; // keep the search box empty
        },
        (error) => {
            console.warn('Location error:', error.code, error.message);
            const reasons = {
                1: 'Location permission denied',
                2: 'Position unavailable',
                3: 'Location request timed out'
            };
            loadDefaultLocation(reasons[error.code] || 'Location blocked');
        },
        { timeout: 10000, maximumAge: 300000 }
    );
}

// If location fails, show a default city so the page is never empty
async function loadDefaultLocation(reason) {
    await chooseLocation({
        name: 'Kempton Park',
        admin1: 'Gauteng',
        country: 'South Africa',
        latitude: -26.1,
        longitude: 28.23
    });
    searchInput.value = '';
    locationName.textContent += ' (' + reason + ', showing default)';
}

// Turn coordinates into a place name (OpenStreetMap Nominatim, free)
async function reverseGeocode(lat, lon) {
    try {
        const url = 'https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=14&lat='
            + lat + '&lon=' + lon;
        const response = await fetch(url);
        const data = await response.json();
        const a = data.address || {};

        return {
            name: a.suburb || a.town || a.city || a.village || a.county || 'Your location',
            admin1: a.state,
            country: a.country,
            latitude: lat,
            longitude: lon
        };
    } catch (error) {
        return { name: 'Your location', latitude: lat, longitude: lon };
    }
}

// Run these once the whole script above has loaded
initRadar();
detectLocation();