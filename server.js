import Fastify from 'fastify';
import fetch from 'node-fetch';
import path from 'path';
import hbs from 'handlebars';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import fastifyStatic from '@fastify/static';
import fastifyView from '@fastify/view';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fastify = Fastify({ logger: true });

// Register custom Handlebars helper
hbs.registerHelper('json', function (context) {
  return JSON.stringify(context, null, 2);
});

// Serve static files
fastify.register(fastifyStatic, {
  root: path.join(__dirname, 'public'),
});

// Configure Handlebars
fastify.register(fastifyView, {
  engine: {
    handlebars: hbs,
  },
  root: path.join(__dirname, 'src/pages'),
});

// FRED API Series IDs
const wageSeriesIds = {
  black: 'LEU0252883700', // Median Weekly Earnings for Black Workers
  white: 'LEU0252881500', // Median Weekly Earnings for White Workers
  hispanic: 'LEU0252881900', // Median Weekly Earnings for Hispanic Workers
};

const laborForceSeriesId = 'LNS11300006'; // Labor Force Participation Rate for Black Americans

// Fetch FRED data
async function fetchFredData(seriesIds) {
  const apiKey = process.env.FRED_API_KEY;
  const results = {};

  for (const [key, seriesId] of Object.entries(seriesIds)) {
    const apiUrl = `https://api.stlouisfed.org/fred/series/observations?series_id=${seriesId}&api_key=${apiKey}&file_type=json`;
    console.log(`Fetching data from: ${apiUrl}`); // Log the API URL

    try {
      const response = await fetch(apiUrl);
      const data = await response.json();
      console.log(`Data for ${key} (${seriesId}):`, data); // Log the API response
      results[key] = data.observations;
    } catch (error) {
      console.error(`Error fetching FRED data for ${key} (${seriesId}):`, error);
      results[key] = null;
    }
  }

  return results;
}

// Calculate wage gap ratio
function calculateWageGap(blackEarnings, whiteEarnings) {
  if (!blackEarnings || !whiteEarnings || blackEarnings.length === 0 || whiteEarnings.length === 0) {
    console.error('Invalid data for wage gap calculation:', { blackEarnings, whiteEarnings });
    return null;
  }

  const latestBlack = blackEarnings[blackEarnings.length - 1].value;
  const latestWhite = whiteEarnings[whiteEarnings.length - 1].value;

  if (latestBlack === '.' || latestWhite === '.') {
    console.error('Missing data for latest earnings:', { latestBlack, latestWhite });
    return null;
  }

  return (latestBlack / latestWhite).toFixed(2);
}

// Home route
fastify.get('/', async (req, reply) => {
  const wageData = await fetchFredData(wageSeriesIds);
  const laborForceData = await fetchFredData({ laborForce: laborForceSeriesId });

  console.log('Labor Force Data:', laborForceData); // Log the labor force data

  const wageGap = calculateWageGap(wageData.black, wageData.white);

  return reply.view('index.hbs', {
    wageData,
    laborForceData: laborForceData.laborForce,
    wageGap,
  });
});

// Start the server
const start = async () => {
  try {
    await fastify.listen({ port: 3000 });
    console.log('Server is running on http://localhost:3000');
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();