const express = require('express');
const cors = require('cors');
const axios = require('axios');
const NodeCache = require('node-cache');

const app = express();
app.use(cors());

// Cache tee times for 5 minutes
const cache = new NodeCache({ stdTTL: 300 });

const COURSES = {
  lafortune: {
    name: 'LaFortune Park',
    courseId: 20922,
    schedules: [
      { id: 6194, label: 'Championship (18 holes)' },
    ],
    bookingUrl: 'https://foreupsoftware.com/index.php/booking/20922/6194#teetimes',
  },
  battlecreek: {
    name: 'Battle Creek',
    courseId: 22756,
    schedules: [
      { id: 11838, label: 'Battle Creek' },
    ],
    bookingUrl: 'https://foreupsoftware.com/index.php/booking/index/22756#teetimes',
  },
  stonecreek: {
    name: 'Page Belcher - Stone Creek',
    courseId: 22842,
    schedules: [
      { id: 12128, label: 'Stone Creek' },
    ],
    bookingUrl: 'https://foreupsoftware.com/index.php/booking/22842/12128#/teetimes',
  },
  oldepage: {
    name: 'Page Belcher - Olde Page',
    courseId: 22842,
    schedules: [
      { id: 12126, label: 'Olde Page' },
    ],
    bookingUrl: 'https://foreupsoftware.com/index.php/booking/22842/12126#/teetimes',
  },
  cherokeehills: {
    name: 'Cherokee Hills',
    courseId: 21188,
    schedules: [
      { id: 7193, label: 'Cherokee Hills' },
    ],
    bookingUrl: 'https://foreupsoftware.com/index.php/booking/21188/7193#/teetimes',
  },
  southlakes: {
    name: 'South Lakes',
    courseId: 20923,
    schedules: [
      { id: 6195, label: 'South Lakes' },
    ],
    bookingUrl: 'https://foreupsoftware.com/index.php/booking/20923/6195#/teetimes',
  },
};

const API_BASE = 'https://foreupsoftware.com/index.php/api/booking';

async function discoverScheduleId(courseId) {
  // Fetch the booking page HTML and parse out the schedule ID
  try {
    const resp = await axios.get(
      `https://foreupsoftware.com/index.php/booking/index/${courseId}`,
      { headers: { 'User-Agent': 'Mozilla/5.0' } }
    );
    const html = resp.data;
    // Look for schedule_id in DEFAULT_FILTER or SCHEDULES
    const filterMatch = html.match(/"schedule_id"\s*:\s*(\d+)/);
    if (filterMatch) return parseInt(filterMatch[1]);
    const schedMatch = html.match(/"id"\s*:\s*(\d+)\s*,\s*"facility_id"/);
    if (schedMatch) return parseInt(schedMatch[1]);
  } catch (e) {
    console.error(`Failed to discover schedule for course ${courseId}:`, e.message);
  }
  return null;
}

async function fetchTeeTimes(courseKey, date, players = 2) {
  const course = COURSES[courseKey];
  if (!course) return [];

  const results = [];

  for (const schedule of course.schedules) {
    let scheduleId = schedule.id;

    // Discover schedule_id if not known
    if (!scheduleId) {
      const cacheKey = `schedule_${course.courseId}`;
      scheduleId = cache.get(cacheKey);
      if (!scheduleId) {
        scheduleId = await discoverScheduleId(course.courseId);
        if (scheduleId) {
          cache.set(cacheKey, scheduleId, 86400);
          schedule.id = scheduleId;
        }
      }
    }

    if (!scheduleId) continue;

    const cacheKey = `times_${courseKey}_${scheduleId}_${date}_${players}`;
    const cached = cache.get(cacheKey);
    if (cached) {
      results.push(...cached);
      continue;
    }

    try {
      const resp = await axios.get(`${API_BASE}/times`, {
        params: {
          time: 'all',
          date,
          holes: 18,
          players,
          booking_class: 'default',
          schedule_id: scheduleId,
          specials_only: 0,
          api_key: 'no_limits',
        },
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
          'Accept': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
          'Referer': course.bookingUrl,
        },
        timeout: 15000,
      });

      const times = (Array.isArray(resp.data) ? resp.data : []).map(slot => ({
        course: course.name,
        courseKey,
        scheduleLabel: schedule.label,
        time: slot.time,
        available_spots: slot.available_spots,
        green_fee: slot.green_fee,
        cart_fee: slot.cart_fee,
        players: slot.players || [],
        holes: slot.holes,
        bookingUrl: course.bookingUrl,
      }));

      cache.set(cacheKey, times);
      results.push(...times);
    } catch (err) {
      console.error(`Error fetching ${course.name} (${schedule.label}):`, err.message);
      // Return empty for this schedule, don't fail everything
    }
  }

  return results;
}

// Main API endpoint
app.get('/api/teetimes', async (req, res) => {
  const { date, players = 2, courses } = req.query;

  if (!date) {
    return res.status(400).json({ error: 'date parameter required (MM-DD-YYYY)' });
  }

  const courseKeys = courses
    ? courses.split(',')
    : Object.keys(COURSES);

  try {
    const promises = courseKeys.map(key => fetchTeeTimes(key.trim(), date, parseInt(players)));
    const results = await Promise.all(promises);
    const allTimes = results.flat();

    // Sort by time
    allTimes.sort((a, b) => {
      if (!a.time || !b.time) return 0;
      return a.time.localeCompare(b.time);
    });

    res.json({
      date,
      players: parseInt(players),
      count: allTimes.length,
      teetimes: allTimes,
    });
  } catch (err) {
    console.error('API error:', err);
    res.status(500).json({ error: 'Failed to fetch tee times' });
  }
});

// Health check
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// Course list
app.get('/api/courses', (req, res) => {
  res.json(Object.entries(COURSES).map(([key, c]) => ({
    key,
    name: c.name,
    bookingUrl: c.bookingUrl,
  })));
});

// Serve React build in production
const path = require('path');
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '..', 'client', 'dist')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'client', 'dist', 'index.html'));
  });
}

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
