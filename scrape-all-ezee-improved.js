// Módulo MEJORADO para scrapear todas las secciones de eZee
// Extrae datos ESTRUCTURADOS directamente del DOM (no HTML/texto crudo)
// Esto reduce el tamaño de datos y facilita el procesamiento

// Función helper para extraer datos de tarjetas (reutilizable para todas las secciones)
async function scrapeCardsFromSection(page, sectionName, cardSelector = 'div.sc-kvxsdh.cczCye') {
  const results = [];
  
  try {
    // Verificar que la página aún existe
    if (page.isClosed()) {
      console.log(`   ⚠️ Page is closed, cannot scrape ${sectionName}`);
      return results;
    }
    
    // Verificar autenticación antes de buscar tarjetas
    const currentUrl = await page.url();
    if (currentUrl.includes('/login')) {
      console.log(`   ❌ ERROR: Not authenticated - redirected to login! URL: ${currentUrl}`);
      return results;
    }
    
    console.log(`🔍 Finding ${sectionName} cards...`);
    console.log(`   📍 Current URL: ${currentUrl}`);
    
    // Esperar un poco más para que las tarjetas carguen
    await page.waitForTimeout(2000);
    
    // Obtener todas las tarjetas
    let cardHandles = await page.$$(cardSelector);
    
    // Si no encuentra con el selector principal, intentar alternativas
    if (cardHandles.length === 0) {
      console.log(`   🔍 Trying alternative selectors for ${sectionName}...`);
      const alternativeSelectors = [
        '.MuiCard-root',
        '.MuiPaper-root',
        '[class*="card"]',
        'div[class*="Card"]'
      ];
      
      for (const altSelector of alternativeSelectors) {
        cardHandles = await page.$$(altSelector);
        if (cardHandles.length > 0) {
          console.log(`   ✅ Found ${cardHandles.length} cards with selector: ${altSelector}`);
          break;
        }
      }
    }
    
    console.log(`📦 Found ${cardHandles.length} ${sectionName} cards`);
    
    if (cardHandles.length === 0) {
      console.log(`   ⚠️ No cards found for ${sectionName} - page may not be loaded or authenticated`);
      return results; // Devolver array vacío
    }
    
    for (let i = 0; i < cardHandles.length; i++) {
    try {
      console.log(`\n📋 Processing ${sectionName} ${i + 1}/${cardHandles.length}...`);
      
      // Obtener la tarjeta nuevamente (por si el DOM cambió)
      // Esperar a que las tarjetas estén cargadas
      try {
        await page.waitForSelector(cardSelector, { timeout: 5000 });
      } catch (e) {
        console.log(`   ⚠️ Cards not found, waiting...`);
        await page.waitForTimeout(2000);
      }
      
      const cards = await page.$$(cardSelector);
      if (i >= cards.length) {
        console.log(`   ⚠️ Card index ${i + 1} out of range (total: ${cards.length})`);
        break;
      }
      
      const card = cards[i];
      
      // Verificar que la tarjeta existe
      if (!card) {
        console.log(`   ⚠️ Card ${i + 1} is null, skipping...`);
        continue;
      }
      
      // 1. Extraer "noches" de la tarjeta ANTES de hacer click
      let noches = 0;
      try {
        const nightsElement = await card.$('div.ant-col.ant-col-4[class*="sc-"]');
        if (nightsElement) {
          const nightsText = await page.evaluate(el => el.textContent, nightsElement);
          const nightsMatch = nightsText.match(/(\d+)\s*Nights?/i);
          if (nightsMatch) {
            noches = parseInt(nightsMatch[1]);
            console.log(`   ✅ Nights extracted: ${noches}`);
          }
        }
      } catch (e) {
        console.log(`   ⚠️ Could not extract nights from card: ${e.message}`);
      }
      
      // 2. Hacer click en la tarjeta para abrir el popup
      try {
        // Re-obtener la tarjeta antes de hacer click (por si el DOM cambió)
        const currentCards = await page.$$(cardSelector);
        if (i >= currentCards.length || !currentCards[i]) {
          console.log(`   ⚠️ Card ${i + 1} no longer exists, skipping...`);
          continue;
        }
        const cardToClick = currentCards[i];
        
        // Hacer scroll hasta el elemento usando JavaScript (más confiable)
        try {
          await page.evaluate((selector, index) => {
            const cards = Array.from(document.querySelectorAll(selector));
            if (index < cards.length && cards[index]) {
              cards[index].scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
          }, cardSelector, i);
          await page.waitForTimeout(500);
        } catch (scrollError) {
          // Ignorar errores de scroll
          console.log(`   ⚠️ Scroll error (ignored): ${scrollError.message}`);
        }
        
        // Intentar hacer click con múltiples estrategias
        let clickSuccess = false;
        
        // Estrategia 1: JavaScript click directo (más confiable que Puppeteer click)
        try {
          await page.evaluate((selector, index) => {
            const cards = Array.from(document.querySelectorAll(selector));
            if (index < cards.length && cards[index]) {
              const card = cards[index];
              // Asegurar que esté visible
              card.scrollIntoView({ behavior: 'instant', block: 'center' });
              // Hacer click
              card.click();
            }
          }, cardSelector, i);
          clickSuccess = true;
        } catch (clickError1) {
          // Estrategia 2: Click normal de Puppeteer
          try {
            // Re-obtener el elemento
            const cardsForClick = await page.$$(cardSelector);
            if (i < cardsForClick.length && cardsForClick[i]) {
              await cardsForClick[i].click({ delay: 100 });
              clickSuccess = true;
            } else {
              throw new Error('Card not found for Puppeteer click');
            }
          } catch (clickError2) {
            // Estrategia 3: Click en el centro usando bounding box
            try {
              const cardsForBox = await page.$$(cardSelector);
              if (i < cardsForBox.length && cardsForBox[i]) {
                const box = await cardsForBox[i].boundingBox();
                if (box) {
                  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
                  clickSuccess = true;
                } else {
                  throw new Error('Element has no bounding box');
                }
              } else {
                throw new Error('Card not found for bounding box');
              }
            } catch (clickError3) {
              // Si todas las estrategias fallan, continuar con la siguiente tarjeta
              console.log(`   ⚠️ All click strategies failed for card ${i + 1}, skipping...`);
              console.log(`      Error 1: ${clickError1.message}`);
              console.log(`      Error 2: ${clickError2.message}`);
              console.log(`      Error 3: ${clickError3.message}`);
              continue;
            }
          }
        }
        
        if (!clickSuccess) {
          console.log(`   ⚠️ Click failed for card ${i + 1}, skipping...`);
          continue;
        }
        
        // Esperar a que se abra el popup
        await page.waitForTimeout(1500);
        
      } catch (clickError) {
        console.log(`   ⚠️ Error clicking card ${i + 1}: ${clickError.message}`);
        // Intentar cerrar cualquier popup que pueda estar abierto
        try {
          await page.keyboard.press('Escape');
          await page.waitForTimeout(500);
        } catch (e) {}
        // Continuar con la siguiente tarjeta
        continue;
      }
      
      // 3. Extraer todos los datos del popup (misma lógica que Reservations)
      const cardData = await page.evaluate(() => {
        const data = {
          nombre: null,
          telefono: null,
          correo: null,
          reservationNumber: null,
          voucherNumber: null,
          arrivalDate: null,
          departureDate: null,
          bookingDate: null,
          status: null,
          roomType: null,
          roomNumber: null,
          adultos: 0,
          ninos: 0,
          total: 0,
          paid: 0,
          balance: 0
        };
        
        try {
          // NOMBRE: Buscar span más grande (18px) cerca del inicio
          const allSpans = Array.from(document.querySelectorAll('span'));
          for (const span of allSpans) {
            const style = window.getComputedStyle(span);
            const fontSize = style.fontSize;
            const text = span.textContent?.trim() || '';
            if (fontSize === '18px' && text.length > 3 && text.length < 80 && /^[A-Z]/.test(text)) {
              if (!text.match(/^(Reservation|Voucher|Booking|Arrival|Departure|Room|Total|Paid|Balance)/i)) {
                data.nombre = text;
                break;
              }
            }
          }
          
          // CORREO: Selector específico
          const emailEl = document.querySelector('span.sc-bHDJZS.gGRMfe');
          if (emailEl) {
            data.correo = emailEl.textContent?.trim() || null;
          }
          
          // FECHAS: span.sc-csvytd.bYxtBL (3 elementos: Arrival, Departure, Booking)
          const dateElements = Array.from(document.querySelectorAll('span.sc-csvytd.bYxtBL'));
          if (dateElements.length >= 1) {
            data.arrivalDate = dateElements[0].textContent?.trim() || null;
          }
          if (dateElements.length >= 2) {
            data.departureDate = dateElements[1].textContent?.trim() || null;
          }
          if (dateElements.length >= 3) {
            data.bookingDate = dateElements[2].textContent?.trim() || null;
          }
          
          // TELÉFONO: div.ant-space-item (selector exacto)
          const phoneElements = Array.from(document.querySelectorAll('div.ant-space-item'));
          for (const phoneEl of phoneElements) {
            const phoneText = phoneEl.textContent?.trim() || '';
            if (phoneText.match(/^\d{10,15}$/) || phoneText.match(/^\+\d{10,15}$/)) {
              const cleanPhone = phoneText.replace(/\s+/g, '');
              if (cleanPhone.length >= 10) {
                data.telefono = cleanPhone;
                break;
              }
            }
          }
          
          // RESERVATION NUMBER, VOUCHER NUMBER, ROOM TYPE, ROOM NUMBER
          const labelElements = Array.from(document.querySelectorAll('div.sc-iCfpwr.fKbKMD'));
          
          for (const labelEl of labelElements) {
            const labelText = labelEl.textContent?.trim() || '';
            
            let valueElement = null;
            let nextSibling = labelEl.nextElementSibling;
            while (nextSibling) {
              const siblingText = nextSibling.textContent?.trim() || '';
              if (siblingText && !nextSibling.classList.contains('sc-iCfpwr')) {
                valueElement = nextSibling;
                break;
              }
              nextSibling = nextSibling.nextElementSibling;
            }
            
            if (!valueElement) {
              const parent = labelEl.parentElement;
              if (parent) {
                const valueInParent = parent.querySelector('div.sc-eJHOIC.jnnoOL');
                if (valueInParent && valueInParent !== labelEl) {
                  valueElement = valueInParent;
                }
              }
            }
            
            if (!valueElement) {
              const allElements = Array.from(document.querySelectorAll('*'));
              const labelIndex = allElements.indexOf(labelEl);
              for (let i = labelIndex + 1; i < Math.min(labelIndex + 10, allElements.length); i++) {
                const candidate = allElements[i];
                const candidateText = candidate.textContent?.trim() || '';
                if (candidateText && candidateText !== labelText && 
                    !candidate.classList.contains('sc-iCfpwr') &&
                    candidateText.length > 0) {
                  valueElement = candidate;
                  break;
                }
              }
            }
            
            const valueText = valueElement ? valueElement.textContent?.trim() : '';
            
            if (labelText.match(/Reservation\s*Number/i)) {
              if (valueText) {
                const cleanValue = valueText.replace(/\s+/g, '');
                if (/^\d+$/.test(cleanValue) && cleanValue.length >= 3 && cleanValue.length <= 6) {
                  data.reservationNumber = cleanValue;
                }
              }
            }
            else if (labelText.match(/Voucher\s*Number/i)) {
              if (valueText) {
                const cleanValue = valueText.replace(/\s+/g, '');
                if (cleanValue.match(/[\d\/-]+/)) {
                  data.voucherNumber = cleanValue;
                }
              }
            }
            else if (labelText.match(/Room\s*Type/i)) {
              if (valueText) {
                const roomTypeText = valueText.replace(/\s*S\s*\d+.*$/i, '').trim();
                if (roomTypeText) {
                  data.roomType = roomTypeText;
                } else {
                  data.roomType = valueText;
                }
              }
            }
            else if (labelText.match(/Room\s*Number/i)) {
              if (valueText) {
                const roomMatch = valueText.match(/S\s*(\d+)/i);
                if (roomMatch) {
                  data.roomNumber = `S ${roomMatch[1]}`;
                } else {
                  data.roomNumber = valueText;
                }
              }
            }
          }
          
          // Fallback
          if (!data.reservationNumber || !data.voucherNumber || !data.roomType || !data.roomNumber) {
            const infoElements = Array.from(document.querySelectorAll('div.sc-eJHOIC.jnnoOL'));
            for (const el of infoElements) {
              const text = el.textContent?.trim() || '';
              if (!text) continue;
              
              if (!data.reservationNumber && /^\d+$/.test(text) && text.length >= 3 && text.length <= 6) {
                data.reservationNumber = text;
              }
              else if (!data.voucherNumber && (text.match(/[\d-]+\/[\d-]+/) || text.match(/^\d{10,}$/))) {
                data.voucherNumber = text.replace(/\s+/g, '');
              }
              else if (!data.roomType && text.match(/Individual|Compartida|Privada|Room\s*Only/i)) {
                const roomTypeText = text.replace(/\s*S\s*\d+.*$/i, '').trim();
                data.roomType = roomTypeText || text;
              }
              else if (!data.roomNumber && text.match(/S\s*\d+/i)) {
                const roomMatch = text.match(/S\s*(\d+)/i);
                if (roomMatch) {
                  data.roomNumber = `S ${roomMatch[1]}`;
                }
              }
            }
          }
          
          // STATUS
          const statusEl = document.querySelector('div.sc-ivTmOn.cXSEyG');
          if (statusEl) {
            const statusText = statusEl.textContent?.trim() || '';
            if (statusText.toLowerCase().includes('confirm')) {
              data.status = 'confirmed';
            } else if (statusText.toLowerCase().includes('pending')) {
              data.status = 'pending';
            } else if (statusText.toLowerCase().includes('check-in')) {
              data.status = 'checked-in';
            } else if (statusText.toLowerCase().includes('check-out')) {
              data.status = 'checked-out';
            } else if (statusText.toLowerCase().includes('cancel')) {
              data.status = 'cancelled';
            } else {
              data.status = statusText.toLowerCase();
            }
          }
          
          // PERSONAS (Adults/Children)
          const paxEl = document.querySelector('div.sc-cvnuvz.hZreah');
          if (paxEl) {
            const paxText = paxEl.textContent || '';
            const numbers = paxText.match(/\d+/g);
            if (numbers && numbers.length >= 1) {
              data.adultos = parseInt(numbers[0]) || 0;
            }
            if (numbers && numbers.length >= 2) {
              data.ninos = parseInt(numbers[1]) || 0;
            }
          }
          
          // TOTAL, PAID, BALANCE
          const financialElements = Array.from(document.querySelectorAll('div.ant-col.ant-col-12'));
          for (const el of financialElements) {
            const text = el.textContent?.trim() || '';
            const style = window.getComputedStyle(el);
            const color = style.color;
            const parentText = el.parentElement?.textContent || '';
            
            if (text.includes('Mex$') || text.includes('Me$')) {
              const amountMatch = text.match(/[\d,]+\.?\d*/);
              if (amountMatch) {
                const amount = parseFloat(amountMatch[0].replace(/,/g, ''));
                
                if (color.includes('255, 83, 83') || color.includes('FF5353')) {
                  data.balance = amount;
                }
                else if (parentText.includes('Total') || text.includes('Total')) {
                  data.total = amount;
                }
                else if (parentText.includes('Paid') || text.includes('Paid')) {
                  data.paid = amount;
                }
              }
            }
          }
          
        } catch (error) {
          console.error('Error extracting popup data:', error);
        }
        
        return data;
      });
      
      // 4. Agregar noches extraídas de la tarjeta
      cardData.noches = noches;
      cardData.personas = cardData.adultos + cardData.ninos;
      
      // 5. Cerrar el popup
      try {
        // Esperar un momento antes de intentar cerrar
        await page.waitForTimeout(300);
        
        // Buscar botón de cerrar usando JavaScript nativo (más confiable)
        const closeButtonFound = await page.evaluate(() => {
          // Buscar por múltiples selectores CSS válidos
          const selectors = [
            'button[aria-label="Close"]',
            'button[aria-label="close"]',
            '.ant-modal-close',
            '[class*="close"]',
            '[class*="Close"]',
            'button[class*="close"]'
          ];
          
          for (const selector of selectors) {
            const btn = document.querySelector(selector);
            if (btn) {
              const style = window.getComputedStyle(btn);
              const rect = btn.getBoundingClientRect();
              if (rect.width > 0 && rect.height > 0 && 
                  style.display !== 'none' && 
                  style.visibility !== 'hidden') {
                return true; // Botón encontrado y visible
              }
            }
          }
          
          // Buscar por texto "×" o "X" en botones
          const buttons = Array.from(document.querySelectorAll('button'));
          for (const btn of buttons) {
            const text = btn.textContent?.trim() || '';
            if (text === '×' || text === 'X' || text === '✕') {
              const style = window.getComputedStyle(btn);
              const rect = btn.getBoundingClientRect();
              if (rect.width > 0 && rect.height > 0 && 
                  style.display !== 'none' && 
                  style.visibility !== 'hidden') {
                return true; // Botón encontrado por texto
              }
            }
          }
          
          return false;
        });
        
        if (closeButtonFound) {
          // Intentar hacer click en el botón usando JavaScript
          try {
            await page.evaluate(() => {
              const selectors = [
                'button[aria-label="Close"]',
                'button[aria-label="close"]',
                '.ant-modal-close',
                '[class*="close"]',
                '[class*="Close"]',
                'button[class*="close"]'
              ];
              
              for (const selector of selectors) {
                const btn = document.querySelector(selector);
                if (btn) {
                  const style = window.getComputedStyle(btn);
                  const rect = btn.getBoundingClientRect();
                  if (rect.width > 0 && rect.height > 0 && 
                      style.display !== 'none' && 
                      style.visibility !== 'hidden') {
                    btn.click();
                    return;
                  }
                }
              }
              
              // Buscar por texto
              const buttons = Array.from(document.querySelectorAll('button'));
              for (const btn of buttons) {
                const text = btn.textContent?.trim() || '';
                if (text === '×' || text === 'X' || text === '✕') {
                  const style = window.getComputedStyle(btn);
                  const rect = btn.getBoundingClientRect();
                  if (rect.width > 0 && rect.height > 0 && 
                      style.display !== 'none' && 
                      style.visibility !== 'hidden') {
                    btn.click();
                    return;
                  }
                }
              }
            });
          } catch (clickError) {
            // Si falla el click, usar ESC
            await page.keyboard.press('Escape');
          }
        } else {
          // Si no se encuentra botón, usar ESC directamente
          await page.keyboard.press('Escape');
        }
        
        await page.waitForTimeout(500);
        
        // Verificar que el popup se cerró
        try {
          await page.waitForFunction(
            () => {
              const modals = document.querySelectorAll('[class*="modal"], [class*="Modal"], [role="dialog"]');
              return Array.from(modals).every(modal => {
                const style = window.getComputedStyle(modal);
                return style.display === 'none' || style.visibility === 'hidden' || !modal.offsetParent;
              });
            },
            { timeout: 2000 }
          );
        } catch (e) {
          // Si no se cierra, intentar ESC de nuevo
          await page.keyboard.press('Escape');
          await page.waitForTimeout(500);
        }
      } catch (e) {
        console.log(`   ⚠️ Could not close popup: ${e.message}`);
        // Último intento con ESC
        try {
          await page.keyboard.press('Escape');
          await page.waitForTimeout(500);
        } catch (escError) {
          // Ignorar si también falla
        }
      }
      
      // 6. Agregar a resultados
      if (cardData.nombre || cardData.reservationNumber) {
        results.push({
          nombre: cardData.nombre || 'Unknown',
          telefono: cardData.telefono,
          correo: cardData.correo,
          bookingId: cardData.reservationNumber ? 
            (cardData.voucherNumber ? 
              `${cardData.reservationNumber} | ${cardData.voucherNumber}` : 
              cardData.reservationNumber) : null,
          reservationNumber: cardData.reservationNumber,
          voucherNumber: cardData.voucherNumber,
          checkInDate: cardData.arrivalDate ? cardData.arrivalDate.split(' ')[0] : null,
          checkOutDate: cardData.departureDate ? cardData.departureDate.split(' ')[0] : null,
          checkInTime: cardData.arrivalDate ? cardData.arrivalDate.split(' ').slice(1).join(' ') : null,
          checkOutTime: cardData.departureDate ? cardData.departureDate.split(' ').slice(1).join(' ') : null,
          bookingDate: cardData.bookingDate ? cardData.bookingDate.split(' ')[0] : null,
          noches: cardData.noches,
          adultos: cardData.adultos,
          ninos: cardData.ninos,
          personas: cardData.personas,
          habitacion: cardData.roomNumber || cardData.roomType,
          roomType: cardData.roomType,
          roomNumber: cardData.roomNumber,
          total: cardData.total,
          paid: cardData.paid,
          balance: cardData.balance,
          status: cardData.status || 'pending'
        });
        console.log(`   ✅ ${sectionName} extracted: ${cardData.nombre || cardData.reservationNumber}`);
      } else {
        console.log(`   ⚠️ Skipped ${sectionName} ${i + 1} (no valid data)`);
      }
      
    } catch (error) {
      console.error(`   ❌ Error processing ${sectionName} ${i + 1}:`, error.message);
      
      // Limpiar cualquier popup o overlay que pueda estar abierto
      try {
        // Intentar cerrar con ESC múltiples veces
        for (let escAttempt = 0; escAttempt < 3; escAttempt++) {
          await page.keyboard.press('Escape');
          await page.waitForTimeout(300);
        }
        
        // Verificar si hay algún modal o popup abierto y cerrarlo
        const hasOpenModal = await page.evaluate(() => {
          const modals = document.querySelectorAll('[class*="modal"], [class*="Modal"], [role="dialog"]');
          return Array.from(modals).some(modal => {
            const style = window.getComputedStyle(modal);
            return style.display !== 'none' && style.visibility !== 'hidden' && modal.offsetParent;
          });
        });
        
        if (hasOpenModal) {
          // Intentar hacer click fuera del modal
          await page.mouse.click(10, 10);
          await page.waitForTimeout(300);
        }
      } catch (cleanupError) {
        // Ignorar errores de limpieza
        console.log(`   ⚠️ Cleanup error (ignored): ${cleanupError.message}`);
      }
      
      // Continuar con la siguiente tarjeta en lugar de fallar completamente
      continue;
    }
    }
  } catch (sectionError) {
    console.error(`❌ Critical error in scrapeCardsFromSection for ${sectionName}:`, sectionError.message);
    // Devolver resultados parciales si hay alguno, o array vacío
  }
  
  console.log(`✅ Completed ${sectionName} scraping: ${results.length} items extracted`);
  return results;
}

async function scrapeAllEzeeImproved(page) {
  const results = {
    reservations: [],
    arrivals: [],
    departures: [],
    inhouse: [],
    stayview: {
      occupancy: [],
      availability: [],
      stats: {}
    },
    timestamp: new Date().toISOString()
  };

  try {
    console.log('📊 Starting comprehensive eZee scraping (IMPROVED)...');


    // ==================== RESERVATIONS ====================
    console.log('\n📋 Scraping RESERVATIONS...');
    
    // Verificar que la página aún existe
    if (page.isClosed()) {
      throw new Error('Page was closed before scraping reservations');
    }
    
    const currentUrlBeforeNav = await page.url();
    console.log(`📍 Current URL before navigation: ${currentUrlBeforeNav}`);
    
    // Solo navegar si no estamos ya en la página de reservations
    if (!currentUrlBeforeNav.includes('/frontoffice/reservations')) {
      await page.goto('https://live.ipms247.com/frontoffice/reservations', {
        waitUntil: 'networkidle2',
        timeout: 30000  // Reducido de 60000
      });
      
      // Verificar que no fuimos redirigidos al login
      const currentUrl = await page.url();
      if (currentUrl.includes('/login')) {
        throw new Error('Not authenticated - redirected to login page');
      }
      console.log(`✅ Navigated to reservations: ${currentUrl}`);
    }
    
    await page.waitForTimeout(2000);
    
    // Click en tab Reservations
    await page.evaluate(() => {
      const tabs = Array.from(document.querySelectorAll('div.ant-tabs-tab, button[role="tab"]'));
      const reservationsTab = tabs.find(tab => tab.textContent && tab.textContent.includes('Reservations'));
      if (reservationsTab) reservationsTab.click();
    });
    
    await page.waitForTimeout(3000);
    
    // Usar función helper para extraer datos
    try {
      results.reservations = await scrapeCardsFromSection(page, 'reservation');
      console.log(`✅ Found ${results.reservations.length} reservations`);
    } catch (error) {
      console.error('❌ Error scraping reservations:', error.message);
      results.reservations = []; // Continuar con array vacío
    }

    // ==================== ARRIVALS ====================
    console.log('\n✈️ Scraping ARRIVALS...');
    // Ya estamos en la página de reservations, solo cambiar de pestaña
    await page.evaluate(() => {
      const tabs = Array.from(document.querySelectorAll('div.ant-tabs-tab, button[role="tab"]'));
      const arrivalsTab = tabs.find(tab => tab.textContent.includes('Arrivals'));
      if (arrivalsTab) arrivalsTab.click();
    });
    
    await page.waitForTimeout(3000);
    
    // Usar función helper para extraer datos
    try {
      results.arrivals = await scrapeCardsFromSection(page, 'arrival');
      console.log(`✅ Found ${results.arrivals.length} arrivals`);
    } catch (error) {
      console.error('❌ Error scraping arrivals:', error.message);
      results.arrivals = []; // Continuar con array vacío
    }

    // ==================== DEPARTURES ====================
    console.log('\n✈️ Scraping DEPARTURES...');
    // Cambiar a pestaña Departures
    await page.evaluate(() => {
      const tabs = Array.from(document.querySelectorAll('div.ant-tabs-tab, button[role="tab"]'));
      const departuresTab = tabs.find(tab => tab.textContent.includes('Departures'));
      if (departuresTab) departuresTab.click();
    });
    
    await page.waitForTimeout(3000);
    
    // Usar función helper para extraer datos
    try {
      results.departures = await scrapeCardsFromSection(page, 'departure');
      console.log(`✅ Found ${results.departures.length} departures`);
    } catch (error) {
      console.error('❌ Error scraping departures:', error.message);
      results.departures = []; // Continuar con array vacío
    }

    // ==================== IN-HOUSE ====================
    console.log('\n🏨 Scraping IN-HOUSE...');
    // Cambiar a pestaña In-house
    await page.evaluate(() => {
      const tabs = Array.from(document.querySelectorAll('div.ant-tabs-tab, button[role="tab"]'));
      const inhouseTab = tabs.find(tab => tab.textContent.includes('In-house'));
      if (inhouseTab) inhouseTab.click();
    });
    
    await page.waitForTimeout(3000);
    
    // Usar función helper para extraer datos
    try {
      results.inhouse = await scrapeCardsFromSection(page, 'in-house');
      console.log(`✅ Found ${results.inhouse.length} in-house reservations`);
    } catch (error) {
      console.error('❌ Error scraping in-house:', error.message);
      results.inhouse = []; // Continuar con array vacío
    }

    // ==================== STAYVIEW ====================
    console.log('\n📊 Scraping STAYVIEW...');
    try {
      // Verificar que la página aún existe antes de navegar
      if (page.isClosed()) {
        throw new Error('Page was closed before navigating to stayview');
      }
      
      await page.goto('https://live.ipms247.com/frontoffice/stayview', {
        waitUntil: 'networkidle2',
        timeout: 30000  // Reducido de 60000
      });
      
      // Verificar que no fuimos redirigidos al login
      const currentUrl = page.url();
      if (currentUrl.includes('/login')) {
        throw new Error('Not authenticated - redirected to login page when accessing stayview');
      }
      
      await page.waitForTimeout(3000);
    } catch (navError) {
      console.error('❌ Error navigating to stayview:', navError.message);
      // Continuar con datos vacíos en lugar de lanzar error
      results.stayview = {
        occupancy: [],
        availability: [],
        stats: { error: navError.message }
      };
      return results; // Retornar resultados parciales
    }
    
    const stayviewData = await page.evaluate(() => {
      const data = {
        occupancy: [],
        availability: [],
        stats: {}
      };
      
      // Extraer Availability
      try {
        const availabilityRow = Array.from(document.querySelectorAll('td.ant-table-cell')).find(
          cell => cell.textContent?.includes('Availability')
        );
        
        if (availabilityRow) {
          const row = availabilityRow.closest('tr');
          const cells = row?.querySelectorAll('td.ant-table-cell.availability-cell, td.ant-table-cell.ant-table-cell-ellipsis');
          
          cells?.forEach((cell, index) => {
            const value = cell.textContent?.trim();
            if (value && value !== 'N/A' && !isNaN(value)) {
              data.availability.push({
                dayIndex: index,
                available: parseInt(value)
              });
            }
          });
        }
      } catch (e) {
        console.error('Error extracting availability:', e);
      }
      
      // Extraer Occupancy(%)
      try {
        const occupancyRow = Array.from(document.querySelectorAll('td.ant-table-cell')).find(
          cell => cell.textContent?.includes('Occupancy(%)')
        );
        
        if (occupancyRow) {
          const row = occupancyRow.closest('tr');
          const cells = row?.querySelectorAll('td.ant-table-cell.occupancy-cell, td.ant-table-cell.ant-table-cell-ellipsis');
          
          cells?.forEach((cell, index) => {
            const value = cell.textContent?.trim();
            if (value && value !== 'N/A' && !isNaN(value)) {
              data.occupancy.push({
                dayIndex: index,
                percentage: parseInt(value)
              });
            }
          });
        }
      } catch (e) {
        console.error('Error extracting occupancy:', e);
      }
      
      return data;
    });
    
    results.stayview = stayviewData;
    console.log(`✅ StayView data extracted`);
    console.log(`   - Occupancy points: ${stayviewData.occupancy.length}`);
    console.log(`   - Availability points: ${stayviewData.availability.length}`);
    console.log(`   - Stats:`, stayviewData.stats);

    // Devolver los resultados directamente (sin wrapper 'data')
    return {
      success: true,
      reservations: results.reservations || [],
      arrivals: results.arrivals || [],
      departures: results.departures || [],
      inhouse: results.inhouse || [],
      stayview: results.stayview || {
        occupancy: [],
        availability: [],
        stats: {}
      },
      timestamp: new Date().toISOString()
    };

  } catch (error) {
    console.error('❌ Error in scrapeAllEzeeImproved:', error);
    // NUNCA devolver success: false, siempre devolver success: true con los datos que tengamos
    // Esto evita que el servidor devuelva un error 500
    return {
      success: true,
      reservations: results.reservations || [],
      arrivals: results.arrivals || [],
      departures: results.departures || [],
      inhouse: results.inhouse || [],
      stayview: results.stayview || {
        occupancy: [],
        availability: [],
        stats: {}
      },
      timestamp: new Date().toISOString(),
      warning: `Some errors occurred during scraping: ${error.message}`
    };
  }
}

module.exports = { scrapeAllEzeeImproved };

