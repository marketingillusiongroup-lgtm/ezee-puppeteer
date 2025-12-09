// Módulo MEJORADO para scrapear todas las secciones de eZee
// Extrae datos ESTRUCTURADOS directamente del DOM (no HTML/texto crudo)
// Esto reduce el tamaño de datos y facilita el procesamiento

// Función helper para extraer datos de tarjetas (reutilizable para todas las secciones)
async function scrapeCardsFromSection(page, sectionName, cardSelector = 'div.sc-kvxsdh.cczCye') {
  const results = [];
  
  console.log(`🔍 Finding ${sectionName} cards...`);
  
  // Obtener todas las tarjetas
  const cardHandles = await page.$$(cardSelector);
  console.log(`📦 Found ${cardHandles.length} ${sectionName} cards`);
  
  for (let i = 0; i < cardHandles.length; i++) {
    try {
      console.log(`\n📋 Processing ${sectionName} ${i + 1}/${cardHandles.length}...`);
      
      // Obtener la tarjeta nuevamente (por si el DOM cambió)
      const cards = await page.$$(cardSelector);
      if (i >= cards.length) break;
      
      const card = cards[i];
      
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
      await card.click();
      await page.waitForTimeout(1500); // Esperar a que se abra el popup
      
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
        const closeButton = await page.$('button[aria-label="Close"], button:has-text("×"), [class*="close"], [class*="Close"]');
        if (closeButton) {
          await closeButton.click();
        } else {
          await page.keyboard.press('Escape');
        }
        await page.waitForTimeout(500);
      } catch (e) {
        console.log(`   ⚠️ Could not close popup: ${e.message}`);
        await page.keyboard.press('Escape');
        await page.waitForTimeout(500);
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
      try {
        await page.keyboard.press('Escape');
        await page.waitForTimeout(500);
      } catch (e) {}
    }
  }
  
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
    await page.goto('https://live.ipms247.com/frontoffice/reservations', {
      waitUntil: 'networkidle2',
      timeout: 60000
    });
    
    // Click en tab Reservations
    await page.evaluate(() => {
      const tabs = Array.from(document.querySelectorAll('div.ant-tabs-tab, button[role="tab"]'));
      const reservationsTab = tabs.find(tab => tab.textContent.includes('Reservations'));
      if (reservationsTab) reservationsTab.click();
    });
    
    await page.waitForTimeout(3000);
    
    // Usar función helper para extraer datos
    results.reservations = await scrapeCardsFromSection(page, 'reservation');
    console.log(`✅ Found ${results.reservations.length} reservations`);

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
    results.arrivals = await scrapeCardsFromSection(page, 'arrival');
    console.log(`✅ Found ${results.arrivals.length} arrivals`);

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
    results.departures = await scrapeCardsFromSection(page, 'departure');
    console.log(`✅ Found ${results.departures.length} departures`);

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
    results.inhouse = await scrapeCardsFromSection(page, 'in-house');
    console.log(`✅ Found ${results.inhouse.length} in-house reservations`);

    // ==================== STAYVIEW ====================
    console.log('\n📊 Scraping STAYVIEW...');
    await page.goto('https://live.ipms247.com/frontoffice/stayview', {
      waitUntil: 'networkidle2',
      timeout: 60000
    });
    
    await page.waitForTimeout(3000);
    
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

    return {
      success: true,
      data: results
    };

  } catch (error) {
    console.error('❌ Error in scrapeAllEzeeImproved:', error);
    return {
      success: false,
      error: error.message,
      data: results
    };
  }
}

module.exports = { scrapeAllEzeeImproved };

