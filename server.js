const express = require('express');
const puppeteer = require('puppeteer');
require('dotenv').config();
const { scrapeStayView } = require('./scrape-stayview');
const { scrapeAllEzee } = require('./scrape-all-ezee');
const { scrapeAllEzeeImproved } = require('./scrape-all-ezee-improved');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Configuración
const PORT = process.env.PORT || 3000;

// Validar que las credenciales estén configuradas
if (!process.env.EZEE_USERNAME || !process.env.EZEE_PASSWORD || !process.env.EZEE_PROPERTY_CODE) {
  console.error('❌ ERROR: Missing eZee credentials in environment variables');
  console.error('Please set: EZEE_USERNAME, EZEE_PASSWORD, EZEE_PROPERTY_CODE');
  process.exit(1);
}

const EZEE_CREDENTIALS = {
  username: process.env.EZEE_USERNAME,
  password: process.env.EZEE_PASSWORD,
  propertyCode: process.env.EZEE_PROPERTY_CODE
};

const EZEE_URLS = {
  login: 'https://live.ipms247.com/login/',
  reservations: 'https://live.ipms247.com/frontoffice/reservations',
  availability: 'https://live.ipms247.com/frontoffice/stayview'
};

// Navegador compartido (más rápido)
let browser = null;

// Inicializar navegador
async function getBrowser() {
  if (!browser) {
    browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu'
      ]
    });
  }
  return browser;
}

// Función de scraping
async function scrapeEzee(queryType = 'general') {
  const browser = await getBrowser();
  const page = await browser.newPage();
  
  try {
    console.log('🔐 Starting eZee scraping...');
    
    // Configurar página
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    // Ir a login
    console.log('📄 Loading login page...');
    await page.goto(EZEE_URLS.login, { waitUntil: 'networkidle2', timeout: 60000 });
    
    // Esperar formulario - usar selectores exactos que funcionaron
    console.log('⏳ Waiting for login form...');
    await page.waitForSelector('input#username', { timeout: 15000 });
    
    // Llenar formulario con selectores exactos
    console.log('✍️ Filling login form...');
    await page.type('input#username', EZEE_CREDENTIALS.username);
    console.log('  ✅ Username filled');
    
    await page.type('input#password', EZEE_CREDENTIALS.password);
    console.log('  ✅ Password filled');
    
    await page.type('input#hotelcode', EZEE_CREDENTIALS.propertyCode);
    console.log('  ✅ Property code filled');
    
    // Login - usar el selector exacto que funcionó
    console.log('🔑 Clicking SIGN IN...');
    await page.click('button#login');
    console.log('✅ SIGN IN clicked');
    
    // Esperar navegación después del login
    console.log('⏳ Waiting for login to complete...');
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(3000);
    
    // PASO CRÍTICO: Hacer clic en "Property Management System"
    console.log('🏨 Looking for Property Management System button...');
    let pmsClicked = false;
    
    try {
      await page.waitForTimeout(3000); // Esperar a que cargue la página
      
      // Estrategia 1: Buscar por selector con clases button.btn.btn-primary.system
      try {
        await page.waitForSelector('button.btn.btn-primary.system', { 
          visible: true, 
          timeout: 15000 
        });
        
        const isClickable = await page.evaluate(() => {
          const btn = document.querySelector('button.btn.btn-primary.system');
          if (!btn) return false;
          const style = window.getComputedStyle(btn);
          const rect = btn.getBoundingClientRect();
          return (
            rect.width > 0 &&
            rect.height > 0 &&
            style.display !== 'none' &&
            style.visibility !== 'hidden' &&
            !btn.disabled
          );
        });
        
        if (isClickable) {
          await page.click('button.btn.btn-primary.system', { delay: 100 });
          pmsClicked = true;
          console.log('✅ PMS button clicked (by classes)');
        }
      } catch (e) {
        console.log('⚠️ PMS button by classes not found, trying by text...');
      }
      
      // Estrategia 2: Buscar por texto
      if (!pmsClicked) {
        const clicked = await page.evaluate(() => {
          const buttons = Array.from(document.querySelectorAll('button'));
          const pmsButton = buttons.find(btn => 
            btn.textContent && btn.textContent.trim() === 'Property Management System'
          );
          if (pmsButton) {
            pmsButton.click();
            return true;
          }
          return false;
        });
        
        if (clicked) {
          pmsClicked = true;
          console.log('✅ PMS button clicked (by text)');
        }
      }
      
      if (pmsClicked) {
        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {});
        await page.waitForTimeout(3000);
      } else {
        console.log('⚠️ PMS button not found, trying direct navigation...');
        await page.goto('https://live.ipms247.com/frontoffice/reservations', { 
          waitUntil: 'networkidle2', 
          timeout: 30000 
        });
      }
    } catch (error) {
      console.log('⚠️ Error with PMS button:', error.message);
      // Intentar navegación directa
      await page.goto('https://live.ipms247.com/frontoffice/reservations', { 
        waitUntil: 'networkidle2', 
        timeout: 30000 
      });
    }
    
    // Verificar que estamos logueados
    const currentUrl = page.url();
    console.log('📍 Current URL:', currentUrl);
    
    if (currentUrl.includes('/login')) {
      throw new Error('Login failed - still on login page');
    }
    
    let data = {};
    
    // Extraer reservas
    if (queryType === 'reservations' || queryType === 'general') {
      console.log('📋 Navigating to reservations page...');
      await page.goto(EZEE_URLS.reservations, { waitUntil: 'networkidle2', timeout: 60000 });
      
      // Esperar a que carguen las tarjetas de Material-UI
      console.log('⏳ Waiting for reservation cards to load...');
      await page.waitForSelector('.MuiCard-root, .MuiPaper-root', { timeout: 15000 }).catch(() => {
        console.log('⚠️ No MUI cards found, trying alternative selectors...');
      });
      
      await page.waitForTimeout(3000); // Dar tiempo extra para que cargue todo
      
      console.log('📊 Extracting page content...');
      
      // Extraer el contenido completo de la página para que la IA lo procese
      const pageData = await page.evaluate(() => {
        // Obtener el contenedor principal
        const mainContent = document.querySelector('main, #root, .MuiContainer-root') || document.body;
        
        // Extraer texto limpio
        const textContent = mainContent.textContent.replace(/\s+/g, ' ').trim();
        
        // Contar elementos que parecen reservas
        const cards = document.querySelectorAll('.MuiCard-root, .MuiPaper-root, [class*="card"]');
        
        return {
          html: mainContent.innerHTML.substring(0, 50000), // Limitar tamaño
          text: textContent.substring(0, 10000), // Texto limpio
          cardCount: cards.length,
          url: window.location.href,
          title: document.title
        };
      });
      
      console.log(`✅ Extracted page data (${pageData.cardCount} cards found)`);
      data.reservations = pageData;
    }
    
    // Extraer disponibilidad
    if (queryType === 'availability' || queryType === 'general') {
      await page.goto(EZEE_URLS.availability, { waitUntil: 'networkidle2', timeout: 30000 });
      
      const availability = await page.evaluate(() => {
        const rows = Array.from(document.querySelectorAll('table tbody tr'));
        return rows.map(row => {
          const cells = row.querySelectorAll('td');
          return {
            date: cells[0]?.textContent?.trim() || '',
            roomType: cells[1]?.textContent?.trim() || '',
            available: cells[2]?.textContent?.trim() || '',
            occupied: cells[3]?.textContent?.trim() || '',
            price: cells[4]?.textContent?.trim() || '',
            occupancy: cells[5]?.textContent?.trim() || ''
          };
        });
      });
      
      data.availability = availability;
    }
    
    await page.close();
    
    return {
      success: true,
      type: queryType,
      data: data,
      timestamp: new Date().toISOString()
    };
    
  } catch (error) {
    await page.close();
    throw error;
  }
}

// Endpoints
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.post('/scrape', async (req, res) => {
  try {
    const { type = 'general' } = req.body;
    const result = await scrapeEzee(type);
    res.json(result);
  } catch (error) {
    console.error('Scraping error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Endpoint específico para StayView (optimizado)
app.post('/scrape-stayview', async (req, res) => {
  const browser = await getBrowser();
  const page = await browser.newPage();
  
  try {
    console.log('🔐 Starting StayView scraping...');
    
    // Configurar página
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
    
    // Login
    console.log('📄 Loading login page...');
    await page.goto(EZEE_URLS.login, { waitUntil: 'networkidle2', timeout: 60000 });
    await page.waitForSelector('input#username', { timeout: 15000 });
    
    console.log('✍️ Filling login form...');
    await page.type('input#username', EZEE_CREDENTIALS.username);
    await page.type('input#password', EZEE_CREDENTIALS.password);
    await page.type('input#hotelcode', EZEE_CREDENTIALS.propertyCode);
    
    console.log('🔑 Logging in...');
    // Usar las mismas estrategias mejoradas de login
    await page.waitForTimeout(1000);
    let loginClicked = false;
    
    // Estrategia 1: Selector completo
    try {
      await page.waitForSelector('button#login.btn.btn-primary', { visible: true, timeout: 20000 });
      await page.click('button#login.btn.btn-primary', { delay: 100 });
      loginClicked = true;
    } catch (e) {
      try {
        await page.waitForSelector('button#login', { visible: true, timeout: 15000 });
        await page.click('button#login', { delay: 100 });
        loginClicked = true;
      } catch (e2) {
        // Intentar por texto
        loginClicked = await page.evaluate(() => {
          const buttons = Array.from(document.querySelectorAll('button'));
          const btn = buttons.find(b => b.textContent.trim() === 'SIGN IN' || b.id === 'login');
          if (btn) { btn.click(); return true; }
          return false;
        });
      }
    }
    
    if (!loginClicked) {
      throw new Error('Failed to click login button');
    }
    
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(3000);
    
    // Click PMS button con estrategias mejoradas
    console.log('🏨 Clicking PMS button...');
    let pmsClicked = false;
    
    // Estrategia 1: Por clases
    try {
      await page.waitForSelector('button.btn.btn-primary.system', { visible: true, timeout: 15000 });
      await page.click('button.btn.btn-primary.system', { delay: 100 });
      pmsClicked = true;
      console.log('  ✅ PMS clicked (by classes)');
    } catch (e) {
      // Estrategia 2: Por texto
      pmsClicked = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const pmsButton = buttons.find(btn => 
          btn.textContent && btn.textContent.trim() === 'Property Management System'
        );
        if (pmsButton) { pmsButton.click(); return true; }
        return false;
      });
      if (pmsClicked) console.log('  ✅ PMS clicked (by text)');
    }
    
    await page.waitForTimeout(3000);
    
    // Navegar a StayView
    console.log('📅 Navigating to StayView...');
    await page.goto(EZEE_URLS.availability, { waitUntil: 'networkidle2', timeout: 60000 });
    await page.waitForTimeout(5000); // Dar tiempo para que cargue el calendario
    
    // Usar la función optimizada de scraping
    console.log('📊 Extracting StayView data...');
    const stayViewData = await scrapeStayView(page);
    
    await page.close();
    
    res.json({
      success: true,
      ...stayViewData,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('StayView scraping error:', error);
    await page.close();
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Endpoint COMPLETO - Scrapea TODO de eZee (Recomendado para n8n)
app.post('/scrape-all', async (req, res) => {
  // Crear una nueva página en lugar de reutilizar el navegador compartido
  // Esto evita problemas de estado inconsistente
  const browser = await getBrowser();
  const page = await browser.newPage();
  
  // Configurar timeouts más largos para operaciones lentas
  page.setDefaultNavigationTimeout(60000);
  page.setDefaultTimeout(60000);
  
  try {
    console.log('🚀 Starting COMPLETE eZee scraping...');
    
    // Configurar página
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
    
    // Login
    console.log('📄 Loading login page...');
    await page.goto(EZEE_URLS.login, { waitUntil: 'networkidle2', timeout: 60000 });
    await page.waitForSelector('input#username', { timeout: 15000 });
    
    console.log('✍️ Filling login form...');
    await page.type('input#username', EZEE_CREDENTIALS.username);
    await page.type('input#password', EZEE_CREDENTIALS.password);
    await page.type('input#hotelcode', EZEE_CREDENTIALS.propertyCode);
    
    console.log('🔑 Logging in...');
    // Esperar un momento después de llenar el formulario para que el botón se habilite
    await page.waitForTimeout(2000);
    
    // Intentar múltiples estrategias para encontrar y hacer click en el botón de login
    let loginClicked = false;
    
    // Estrategia 1: Usar el selector completo button#login.btn.btn-primary (más específico)
    try {
      console.log('  🔍 Strategy 1: Looking for button#login.btn.btn-primary...');
      await page.waitForSelector('button#login.btn.btn-primary', { 
        visible: true, 
        timeout: 20000 
      });
      
      // Verificar que el botón es clickeable
      const isClickable = await page.evaluate(() => {
        const btn = document.querySelector('button#login.btn.btn-primary');
        if (!btn) return false;
        const style = window.getComputedStyle(btn);
        const rect = btn.getBoundingClientRect();
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          style.pointerEvents !== 'none' &&
          !btn.disabled
        );
      });
      
      if (isClickable) {
        await page.click('button#login.btn.btn-primary', { delay: 100 });
        loginClicked = true;
        console.log('  ✅ Login clicked (Strategy 1: button#login.btn.btn-primary)');
      }
    } catch (e) {
      console.log('  ⚠️ Strategy 1 failed:', e.message);
    }
    
    // Estrategia 1b: Intentar con selector simple button#login
    if (!loginClicked) {
      try {
        console.log('  🔍 Strategy 1b: Looking for button#login (simple selector)...');
        await page.waitForSelector('button#login', { 
          visible: true, 
          timeout: 15000 
        });
        
        const isClickable = await page.evaluate(() => {
          const btn = document.querySelector('button#login');
          if (!btn) return false;
          const style = window.getComputedStyle(btn);
          const rect = btn.getBoundingClientRect();
          return (
            rect.width > 0 &&
            rect.height > 0 &&
            style.display !== 'none' &&
            style.visibility !== 'hidden' &&
            style.pointerEvents !== 'none' &&
            !btn.disabled
          );
        });
        
        if (isClickable) {
          await page.click('button#login', { delay: 100 });
          loginClicked = true;
          console.log('  ✅ Login clicked (Strategy 1b: button#login)');
        }
      } catch (e) {
        console.log('  ⚠️ Strategy 1b failed:', e.message);
      }
    }
    
    // Estrategia 2: Buscar botón por texto "SIGN IN" (exacto, en mayúsculas)
    if (!loginClicked) {
      try {
        console.log('  🔍 Strategy 2: Looking for button by text "SIGN IN"...');
        loginClicked = await page.evaluate(() => {
          const buttons = Array.from(document.querySelectorAll('button'));
          const loginButton = buttons.find(btn => {
            const text = btn.textContent.trim();
            // Buscar exactamente "SIGN IN" o variaciones
            return text === 'SIGN IN' || 
                   text.toLowerCase() === 'sign in' || 
                   text.toLowerCase().includes('sign in') ||
                   btn.id === 'login';
          });
          
          if (loginButton) {
            const style = window.getComputedStyle(loginButton);
            const rect = loginButton.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0 && 
                style.display !== 'none' && 
                style.visibility !== 'hidden' &&
                style.opacity !== '0' &&
                !loginButton.disabled) {
              loginButton.click();
              return true;
            }
          }
          return false;
        });
        
        if (loginClicked) {
          console.log('  ✅ Login clicked (Strategy 2: by text "SIGN IN")');
        }
      } catch (e) {
        console.log('  ⚠️ Strategy 2 failed:', e.message);
      }
    }
    
    // Estrategia 3: Buscar cualquier botón en el formulario y hacer click
    if (!loginClicked) {
      try {
        console.log('  🔍 Strategy 3: Looking for any submit button...');
        loginClicked = await page.evaluate(() => {
          // Buscar botón submit en el formulario
          const form = document.querySelector('form');
          if (form) {
            const submitBtn = form.querySelector('button[type="submit"], button:not([type])');
            if (submitBtn) {
              submitBtn.click();
              return true;
            }
          }
          return false;
        });
        
        if (loginClicked) {
          console.log('  ✅ Login clicked (Strategy 3)');
        }
      } catch (e) {
        console.log('  ⚠️ Strategy 3 failed:', e.message);
      }
    }
    
    // Estrategia 4: Presionar Enter en el último campo
    if (!loginClicked) {
      try {
        console.log('  🔍 Strategy 4: Pressing Enter on hotelcode field...');
        await page.focus('input#hotelcode');
        await page.keyboard.press('Enter');
        loginClicked = true;
        console.log('  ✅ Enter pressed (Strategy 4)');
      } catch (e) {
        console.log('  ⚠️ Strategy 4 failed:', e.message);
      }
    }
    
    if (!loginClicked) {
      throw new Error('Failed to click login button with all strategies');
    }
    
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(3000);
    
    // Click PMS button
    console.log('🏨 Clicking PMS button...');
    let pmsClicked = false;
    
    // Estrategia 1: Buscar por selector con clases button.btn.btn-primary.system
    try {
      console.log('  🔍 PMS Strategy 1: Looking for button.btn.btn-primary.system...');
      await page.waitForSelector('button.btn.btn-primary.system', { 
        visible: true, 
        timeout: 15000 
      });
      
      const isClickable = await page.evaluate(() => {
        const btn = document.querySelector('button.btn.btn-primary.system');
        if (!btn) return false;
        const style = window.getComputedStyle(btn);
        const rect = btn.getBoundingClientRect();
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          style.opacity !== '0' &&
          !btn.disabled
        );
      });
      
      if (isClickable) {
        await page.click('button.btn.btn-primary.system', { delay: 100 });
        pmsClicked = true;
        console.log('  ✅ PMS button clicked (Strategy 1: by classes)');
      }
    } catch (e) {
      console.log('  ⚠️ PMS Strategy 1 failed:', e.message);
    }
    
    // Estrategia 2: Buscar por texto "Property Management System"
    if (!pmsClicked) {
      try {
        console.log('  🔍 PMS Strategy 2: Looking for button by text...');
        pmsClicked = await page.evaluate(() => {
          const buttons = Array.from(document.querySelectorAll('button'));
          const pmsButton = buttons.find(btn => {
            const text = btn.textContent && btn.textContent.trim();
            return text === 'Property Management System';
          });
          
          if (pmsButton) {
            const style = window.getComputedStyle(pmsButton);
            const rect = pmsButton.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0 && 
                style.display !== 'none' && 
                style.visibility !== 'hidden' &&
                style.opacity !== '0' &&
                !pmsButton.disabled) {
              pmsButton.click();
              return true;
            }
          }
          return false;
        });
        
        if (pmsClicked) {
          console.log('  ✅ PMS button clicked (Strategy 2: by text)');
        }
      } catch (e) {
        console.log('  ⚠️ PMS Strategy 2 failed:', e.message);
      }
    }
    
    // Si encontró el botón, esperar navegación
    if (pmsClicked) {
      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {});
      await page.waitForTimeout(3000);
    } else {
      console.log('⚠️ PMS button not found or not clickable, trying direct navigation...');
      // Intentar navegar directamente a la página de reservations
      await page.goto('https://live.ipms247.com/frontoffice/reservations', {
        waitUntil: 'networkidle2',
        timeout: 60000
      });
      await page.waitForTimeout(3000);
    }
    
    // Usar la función MEJORADA de scraping (extrae datos estructurados)
    console.log('📊 Extracting ALL data from eZee (IMPROVED)...');
    let allData;
    try {
      allData = await scrapeAllEzeeImproved(page);
    } catch (scrapeError) {
      console.error('Error in scrapeAllEzeeImproved, returning empty results:', scrapeError);
      // Si scrapeAllEzeeImproved lanza un error, devolver resultados vacíos en lugar de error 500
      allData = {
        success: true,
        reservations: [],
        arrivals: [],
        departures: [],
        inhouse: [],
        stayview: {
          occupancy: [],
          availability: [],
          stats: {}
        },
        timestamp: new Date().toISOString(),
        warning: `Scraping encountered errors: ${scrapeError.message}`
      };
    }
    
    await page.close();
    
    // Asegurar que siempre devolvemos success: true
    res.json({
      ...allData,
      success: true, // Forzar success: true
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Complete scraping error:', error);
    try {
      await page.close();
    } catch (closeError) {
      // Ignorar errores al cerrar la página
    }
    // NUNCA devolver error 500, siempre devolver success: true con datos vacíos
    res.json({
      success: true,
      reservations: [],
      arrivals: [],
      departures: [],
      inhouse: [],
      stayview: {
        occupancy: [],
        availability: [],
        stats: {}
      },
      timestamp: new Date().toISOString(),
      warning: `Scraping failed: ${error.message}`
    });
  }
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`Puppeteer server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`Scrape endpoint: POST http://localhost:${PORT}/scrape`);
});

// Cleanup al cerrar
process.on('SIGINT', async () => {
  if (browser) {
    await browser.close();
  }
  process.exit();
});
