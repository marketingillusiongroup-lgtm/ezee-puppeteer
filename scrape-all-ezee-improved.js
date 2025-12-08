// Módulo MEJORADO para scrapear todas las secciones de eZee
// Extrae datos ESTRUCTURADOS directamente del DOM (no HTML/texto crudo)
// Esto reduce el tamaño de datos y facilita el procesamiento

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
    
    results.reservations = await page.evaluate(() => {
      // Palabras a excluir (elementos de la UI, no nombres reales)
      const invalidNames = [
        'Make Group', 'Export', 'Search', 'Mini Rooms', 'Illusion',
        'Reservations', 'Arrivals', 'Departures', 'In-house',
        'Booking Date', 'Total', 'Paid', 'Balance', 'Nights',
        'Room', 'Check', 'Confirm', 'Assign Room'
      ];
      
      // Función para validar si un nombre es válido
      const isValidName = (name) => {
        if (!name || name.length < 3) return false;
        const lowerName = name.toLowerCase();
        return !invalidNames.some(invalid => lowerName.includes(invalid.toLowerCase()));
      };
      
      // Función para extraer una reserva estructurada de una tarjeta
      const extractReservation = (card) => {
        try {
          const allText = card.textContent || '';
          
          // VALIDACIÓN INICIAL: Debe tener datos mínimos de una reserva
          const hasRequiredData = (
            allText.includes('Nights') && 
            (allText.includes('Booking Date') || allText.match(/\d{2}\/\d{2}\/\d{4}/)) &&
            (allText.includes('Total') || allText.includes('Me$') || allText.includes('Mex$'))
          );
          
          if (!hasRequiredData) {
            return null; // No es una tarjeta de reserva válida
          }
          
          // EXCLUIR: Botones, headers, y otros elementos de UI
          if (card.tagName === 'BUTTON' || 
              card.closest('button') || 
              card.closest('header') ||
              allText.includes('Make Group') && !allText.includes('Nights')) {
            return null;
          }
          
          // Extraer nombre del huésped - ESTRATEGIA SIMPLIFICADA Y ROBUSTA
          let nombre = '';
          
          // Estrategia 1: Buscar en h6 o Typography-h6 (más confiable)
          const nameElements = card.querySelectorAll('h6, .MuiTypography-h6, [class*="Typography-h6"]');
          for (const el of nameElements) {
            const text = el.textContent?.trim() || '';
            if (isValidName(text) && text.length > 3 && text.length < 80) {
              nombre = text;
              break;
            }
          }
          
          // Estrategia 2: Buscar en las primeras líneas del texto (el nombre siempre está al inicio)
          if (!nombre) {
            const lines = allText.split(/\n/).filter(l => l.trim());
            for (let i = 0; i < Math.min(6, lines.length); i++) {
              let line = lines[i].trim();
              // Limpiar la línea de caracteres especiales al inicio
              line = line.replace(/^[^A-Za-z]*/, '');
              // Buscar nombres con títulos
              const titleMatch = line.match(/(?:Mr\.|Ms\.|Mrs\.|Dr\.|Miss|Mister)?\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,4})/);
              if (titleMatch) {
                const candidate = titleMatch[0].trim();
                if (isValidName(candidate) && candidate.length > 5 && candidate.length < 80) {
                  nombre = candidate;
                  break;
                }
              }
              // Si no tiene título, buscar directamente
              if (!nombre && /^[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,4}$/.test(line)) {
                if (isValidName(line) && line.length > 5 && line.length < 80) {
                  nombre = line;
                  break;
                }
              }
            }
          }
          
          // Estrategia 3: Buscar el primer patrón de nombre válido en el texto (antes del booking ID)
          if (!nombre) {
            // Buscar booking ID primero para saber dónde termina el nombre
            const bookingIdMatch = allText.match(/(\d+)\s*[|]\s*([A-Z0-9/]+)/);
            const searchLimit = bookingIdMatch ? bookingIdMatch.index : 500;
            const textToSearch = allText.substring(0, searchLimit);
            
            const namePattern = /([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,4})/g;
            const matches = textToSearch.match(namePattern);
            if (matches) {
              for (let i = 0; i < Math.min(5, matches.length); i++) {
                const candidate = matches[i].trim();
                if (isValidName(candidate) && candidate.length > 5 && candidate.length < 80) {
                  nombre = candidate;
                  break;
                }
              }
            }
          }
          
          // Estrategia 4: Buscar nombres con títulos en todo el texto
          if (!nombre) {
            const titleMatch = allText.match(/(?:Mr\.|Ms\.|Mrs\.|Dr\.|Miss|Mister)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,4})/);
            if (titleMatch && isValidName(titleMatch[0])) {
              nombre = titleMatch[0].trim();
            }
          }

          // Extraer booking ID - MEJORADO
          let bookingId = '';
          
          // Buscar patrón en el texto completo primero
          const bookingIdPattern = /(\d+)\s*[|]\s*([A-Z0-9/]+)/;
          const bookingMatch = allText.match(bookingIdPattern);
          if (bookingMatch) {
            bookingId = bookingMatch[0].trim();
          } else {
            // Buscar en elementos Typography-body2
            const bookingIdElements = card.querySelectorAll('.MuiTypography-body2, [class*="Typography-body2"]');
            for (const el of bookingIdElements) {
              const text = el.textContent?.trim() || '';
              if (text.match(/\d+\s*[|]\s*[A-Z0-9/]+/)) {
                bookingId = text;
                break;
              }
            }
          }
          
          // Si aún no encontramos, buscar después del nombre
          if (!bookingId && nombre) {
            const nameIndex = allText.indexOf(nombre);
            if (nameIndex >= 0) {
              const textAfterName = allText.substring(nameIndex + nombre.length, nameIndex + nombre.length + 100);
              const match = textAfterName.match(/(\d+)\s*[|]\s*([A-Z0-9/]+)/);
              if (match) {
                bookingId = match[0].trim();
              }
            }
          }

          // Extraer fechas
          const dateMatches = allText.match(/(\d{2}\/\d{2}\/\d{4})/g) || [];
          const checkInDate = dateMatches[0] || null;
          const checkOutDate = dateMatches[1] || null;
          const bookingDate = dateMatches[2] || null;

          // Extraer horas
          const timeMatches = allText.match(/(\d{1,2}:\d{2}:\d{2}\s*(?:AM|PM))/gi) || [];
          const checkInTime = timeMatches[0] || null;
          const checkOutTime = timeMatches[1] || null;

          // Extraer noches
          const nightsMatch = allText.match(/(\d+)\s*Nights?/i);
          const noches = nightsMatch ? parseInt(nightsMatch[1]) : 0;

          // Extraer adultos y niños - ESTRATEGIA MEJORADA
          let adultos = 0;
          let ninos = 0;
          
          // Buscar iconos de adultos/niños (múltiples selectores)
          const iconSelectors = [
            'img[alt*="adult" i], img[alt*="person" i]',
            'img[src*="adult" i], img[src*="person" i]',
            '[id*="adult" i], [id*="person" i]',
            '[class*="adult" i], [class*="person" i]',
            'svg[alt*="adult" i], svg[alt*="person" i]'
          ];
          
          const childIconSelectors = [
            'img[alt*="child" i]',
            'img[src*="child" i]',
            '[id*="child" i]',
            '[class*="child" i]',
            'svg[alt*="child" i]'
          ];
          
          // Buscar iconos de adultos
          for (const selector of iconSelectors) {
            try {
              const icons = card.querySelectorAll(selector);
              if (icons.length > 0) {
                icons.forEach(icon => {
                  // Buscar número siguiente (puede ser sibling o en el mismo elemento padre)
                  let nextEl = icon.nextSibling;
                  while (nextEl && nextEl.nodeType !== 1 && nextEl.nodeType !== 3) {
                    nextEl = nextEl.nextSibling;
                  }
                  if (nextEl) {
                    const text = nextEl.textContent || nextEl.nodeValue || '';
                    const num = parseInt(text.trim());
                    if (!isNaN(num) && num > 0) adultos = num;
                  }
                  // Buscar en el elemento padre
                  const parent = icon.parentElement;
                  if (parent) {
                    const parentText = parent.textContent || '';
                    const match = parentText.match(/(\d+)\s*(?:Adults?|Adult|Person)/i);
                    if (match) {
                      const num = parseInt(match[1]);
                      if (!isNaN(num) && num > 0) adultos = num;
                    }
                  }
                });
                if (adultos > 0) break;
              }
            } catch (e) {}
          }
          
          // Buscar iconos de niños
          for (const selector of childIconSelectors) {
            try {
              const icons = card.querySelectorAll(selector);
              if (icons.length > 0) {
                icons.forEach(icon => {
                  let nextEl = icon.nextSibling;
                  while (nextEl && nextEl.nodeType !== 1 && nextEl.nodeType !== 3) {
                    nextEl = nextEl.nextSibling;
                  }
                  if (nextEl) {
                    const text = nextEl.textContent || nextEl.nodeValue || '';
                    const num = parseInt(text.trim());
                    if (!isNaN(num) && num >= 0) ninos = num;
                  }
                  const parent = icon.parentElement;
                  if (parent) {
                    const parentText = parent.textContent || '';
                    const match = parentText.match(/(\d+)\s*(?:Child|Children)/i);
                    if (match) {
                      const num = parseInt(match[1]);
                      if (!isNaN(num) && num >= 0) ninos = num;
                    }
                  }
                });
                if (ninos >= 0) break;
              }
            } catch (e) {}
          }
          
          // Fallback 1: Buscar en el texto con regex (más común)
          if (adultos === 0) {
            const adultsMatch = allText.match(/(\d+)\s*(?:Adults?|Adult|Person)/i);
            if (adultsMatch) adultos = parseInt(adultsMatch[1]);
          }
          
          if (ninos === 0) {
            const childrenMatch = allText.match(/(\d+)\s*(?:Child|Children)/i);
            if (childrenMatch) ninos = parseInt(childrenMatch[1]);
          }
          
          // Fallback 2: Buscar patrones como "2 0" cerca de palabras clave
          if (adultos === 0 && ninos === 0) {
            const guestPattern = allText.match(/(\d+)\s+(\d+)\s*(?:Room|Adults?|Person|Guest)/i);
            if (guestPattern) {
              adultos = parseInt(guestPattern[1]);
              ninos = parseInt(guestPattern[2]);
            }
          }
          
          // Fallback 3: Buscar números cerca de iconos de personas (último recurso)
          if (adultos === 0) {
            const allImages = card.querySelectorAll('img, svg');
            for (const img of allImages) {
              const alt = (img.getAttribute('alt') || '').toLowerCase();
              const src = (img.getAttribute('src') || '').toLowerCase();
              if (alt.includes('person') || alt.includes('adult') || src.includes('person') || src.includes('adult')) {
                const parent = img.parentElement;
                if (parent) {
                  const parentText = parent.textContent || '';
                  const numbers = parentText.match(/\d+/g);
                  if (numbers && numbers.length > 0) {
                    const num = parseInt(numbers[0]);
                    if (!isNaN(num) && num > 0 && num < 20) {
                      adultos = num;
                      break;
                    }
                  }
                }
              }
            }
          }
          
          const personas = adultos + ninos;

          // Extraer habitación
          const roomMatch = allText.match(/S\s*(\d+)/i) || allText.match(/Room\s*Type[^/]*\/\s*([^/]+)/i);
          const habitacion = roomMatch ? (roomMatch[0].includes('S ') ? `S ${roomMatch[1]}` : roomMatch[1].trim()) : null;

          // Extraer montos (mejorado para capturar diferentes formatos)
          const totalMatch = allText.match(/Total[^\d]*([\d,]+\.?\d*)/i) || allText.match(/Total[^M]*Me?\$?\s*([\d,]+\.?\d*)/i);
          const paidMatch = allText.match(/Paid[^\d]*([\d,]+\.?\d*)/i) || allText.match(/Paid[^M]*Me?\$?\s*([\d,]+\.?\d*)/i);
          const balanceMatch = allText.match(/Balance[^\d]*([\d,]+\.?\d*)/i) || allText.match(/Balance[^M]*Me?\$?\s*([\d,]+\.?\d*)/i);
          
          const total = totalMatch ? parseFloat(totalMatch[1].replace(/,/g, '')) : 0;
          const paid = paidMatch ? parseFloat(paidMatch[1].replace(/,/g, '')) : 0;
          const balance = balanceMatch ? parseFloat(balanceMatch[1].replace(/,/g, '')) : 0;

          // Extraer estado
          const statusText = allText.toLowerCase();
          let status = 'pending';
          if (statusText.includes('confirm')) status = 'confirmed';
          if (statusText.includes('check-in')) status = 'checked-in';
          if (statusText.includes('check-out')) status = 'checked-out';
          if (statusText.includes('cancel')) status = 'cancelled';

          // VALIDACIÓN FINAL: Debe tener datos mínimos
          if (!nombre && !bookingId) {
            return null; // No es una reserva válida
          }
          
          // Validar que el nombre no sea un elemento de UI
          if (nombre && !isValidName(nombre)) {
            nombre = ''; // Invalidar el nombre
          }
          
          // Si no hay nombre válido pero hay booking ID y fechas, es válida
          if (!nombre && bookingId && checkInDate) {
            nombre = 'Unknown'; // Permitir reservas sin nombre si tienen otros datos
          }

          return {
            nombre: nombre || 'Unknown',
            bookingId: bookingId || null,
            checkInDate,
            checkOutDate,
            checkInTime,
            checkOutTime,
            bookingDate,
            noches,
            adultos,
            ninos,
            personas,
            habitacion,
            total,
            paid,
            balance,
            status,
            rawText: allText.substring(0, 500) // Solo para debugging, limitado
          };
        } catch (error) {
          console.error('Error extrayendo reserva:', error);
          return null;
        }
      };
      
      // Buscar tarjetas de reserva - MEJORADO
      // Primero buscar solo .MuiCard-root (más específico)
      let cards = Array.from(document.querySelectorAll('.MuiCard-root'));
      
      // Si no hay, buscar alternativas
      if (cards.length === 0) {
        cards = Array.from(document.querySelectorAll('.MuiPaper-root'));
      }
      
      // Si aún no hay, buscar divs con clases específicas
      if (cards.length === 0) {
        cards = Array.from(document.querySelectorAll('div[class*="sc-"]'));
      }
      
      const reservations = [];
      
      cards.forEach(card => {
        const text = card.textContent || '';
        
        // Validación más estricta: debe tener múltiples indicadores de reserva
        const isReservationCard = (
          text.includes('Nights') && 
          (text.includes('Booking Date') || text.match(/\d{2}\/\d{2}\/\d{4}/)) &&
          (text.includes('Total') || text.includes('Me$') || text.includes('Mex$'))
        );
        
        if (isReservationCard) {
          const reservation = extractReservation(card);
          if (reservation && (reservation.nombre !== 'Unknown' || reservation.bookingId || reservation.checkInDate)) {
            reservations.push(reservation);
          }
        }
      });
      
      return reservations;
    });
    
    console.log(`✅ Found ${results.reservations.length} reservations`);

    // ==================== ARRIVALS ====================
    console.log('\n✈️ Scraping ARRIVALS...');
    await page.evaluate(() => {
      const tabs = Array.from(document.querySelectorAll('div.ant-tabs-tab, button[role="tab"]'));
      const arrivalsTab = tabs.find(tab => tab.textContent.includes('Arrivals'));
      if (arrivalsTab) arrivalsTab.click();
    });
    
    await page.waitForTimeout(3000);
    
    results.arrivals = await page.evaluate(() => {
      const invalidNames = [
        'Make Group', 'Export', 'Search', 'Mini Rooms', 'Illusion',
        'Reservations', 'Arrivals', 'Departures', 'In-house',
        'Booking Date', 'Total', 'Paid', 'Balance', 'Nights',
        'Room', 'Check', 'Confirm', 'Assign Room'
      ];
      
      const isValidName = (name) => {
        if (!name || name.length < 3) return false;
        const lowerName = name.toLowerCase();
        return !invalidNames.some(invalid => lowerName.includes(invalid.toLowerCase()));
      };
      
      const extractReservation = (card) => {
        try {
          const allText = card.textContent || '';
          const hasRequiredData = (
            allText.includes('Nights') && 
            (allText.includes('Booking Date') || allText.match(/\d{2}\/\d{2}\/\d{4}/)) &&
            (allText.includes('Total') || allText.includes('Me$') || allText.includes('Mex$'))
          );
          if (!hasRequiredData) return null;
          if (card.tagName === 'BUTTON' || card.closest('button') || card.closest('header') ||
              (allText.includes('Make Group') && !allText.includes('Nights'))) return null;
          
          let nombre = '';
          const nameElements = card.querySelectorAll('h6, .MuiTypography-h6, [class*="Typography-h6"]');
          for (const el of nameElements) {
            const text = el.textContent?.trim() || '';
            if (isValidName(text) && text.length > 3 && text.length < 60) {
              nombre = text;
              break;
            }
          }
          if (!nombre) {
            const titleMatch = allText.match(/(?:Mr\.|Ms\.|Mrs\.|Dr\.|Miss|Mister)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,4})/);
            if (titleMatch && isValidName(titleMatch[0])) nombre = titleMatch[0].trim();
          }
          if (!nombre) {
            const namePattern = /([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})/g;
            const matches = allText.match(namePattern);
            if (matches) {
              for (const match of matches) {
                const trimmed = match.trim();
                if (isValidName(trimmed) && trimmed.length > 5 && trimmed.length < 50) {
                  nombre = trimmed;
                  break;
                }
              }
            }
          }
          if (!nombre) {
            const lines = allText.split(/\n|(?:\s{2,})/).filter(l => l.trim());
            for (const line of lines.slice(0, 8)) {
              const trimmed = line.trim();
              if (isValidName(trimmed) && trimmed.length > 5 && trimmed.length < 50 && 
                  /^[A-Z]/.test(trimmed) && !trimmed.match(/^\d|^\d{2}\/\d{2}\/\d{4}/)) {
                nombre = trimmed;
                break;
              }
            }
          }
          
          let bookingId = '';
          const bookingIdElements = card.querySelectorAll('.MuiTypography-body2, [class*="Typography-body2"]');
          for (const el of bookingIdElements) {
            const text = el.textContent?.trim() || '';
            if (text.match(/\d+\s*[|]\s*[A-Z0-9/]+/)) {
              bookingId = text;
              break;
            }
          }
          
          const dateMatches = allText.match(/(\d{2}\/\d{2}\/\d{4})/g) || [];
          const checkInDate = dateMatches[0] || null;
          const checkOutDate = dateMatches[1] || null;
          const bookingDate = dateMatches[2] || null;
          const timeMatches = allText.match(/(\d{1,2}:\d{2}:\d{2}\s*(?:AM|PM))/gi) || [];
          const checkInTime = timeMatches[0] || null;
          const checkOutTime = timeMatches[1] || null;
          const nightsMatch = allText.match(/(\d+)\s*Nights?/i);
          const noches = nightsMatch ? parseInt(nightsMatch[1]) : 0;
          
          let adultos = 0;
          let ninos = 0;
          const adultIcons = card.querySelectorAll('[id*="adult"], [id*="Adult"], [alt*="adult"], [alt*="Adult"], [class*="adult"], [class*="Adult"]');
          const childIcons = card.querySelectorAll('[id*="child"], [id*="Child"], [alt*="child"], [alt*="Child"], [class*="child"], [class*="Child"]');
          if (adultIcons.length > 0) {
            adultIcons.forEach(icon => {
              const nextSibling = icon.nextSibling;
              if (nextSibling && nextSibling.textContent) {
                const num = parseInt(nextSibling.textContent.trim());
                if (!isNaN(num) && num > 0) adultos = num;
              }
              const parent = icon.parentElement;
              if (parent) {
                const parentText = parent.textContent || '';
                const match = parentText.match(/(\d+)\s*(?:Adults?|Adult)/i);
                if (match) adultos = parseInt(match[1]);
              }
            });
          }
          if (childIcons.length > 0) {
            childIcons.forEach(icon => {
              const nextSibling = icon.nextSibling;
              if (nextSibling && nextSibling.textContent) {
                const num = parseInt(nextSibling.textContent.trim());
                if (!isNaN(num) && num >= 0) ninos = num;
              }
              const parent = icon.parentElement;
              if (parent) {
                const parentText = parent.textContent || '';
                const match = parentText.match(/(\d+)\s*(?:Child|Children)/i);
                if (match) ninos = parseInt(match[1]);
              }
            });
          }
          if (adultos === 0) {
            const adultsMatch = allText.match(/(\d+)\s*(?:Adults?|Adult)/i);
            if (adultsMatch) adultos = parseInt(adultsMatch[1]);
          }
          if (ninos === 0) {
            const childrenMatch = allText.match(/(\d+)\s*(?:Child|Children)/i);
            if (childrenMatch) ninos = parseInt(childrenMatch[1]);
          }
          if (adultos === 0 && ninos === 0) {
            const guestPattern = allText.match(/(\d+)\s+(\d+)\s*(?:Room|Adults?|Person)/i);
            if (guestPattern) {
              adultos = parseInt(guestPattern[1]);
              ninos = parseInt(guestPattern[2]);
            }
          }
          const personas = adultos + ninos;
          const roomMatch = allText.match(/S\s*(\d+)/i) || allText.match(/Room\s*Type[^/]*\/\s*([^/]+)/i);
          const habitacion = roomMatch ? (roomMatch[0].includes('S ') ? `S ${roomMatch[1]}` : roomMatch[1].trim()) : null;
          const totalMatch = allText.match(/Total[^\d]*([\d,]+\.?\d*)/i) || allText.match(/Total[^M]*Me?\$?\s*([\d,]+\.?\d*)/i);
          const paidMatch = allText.match(/Paid[^\d]*([\d,]+\.?\d*)/i) || allText.match(/Paid[^M]*Me?\$?\s*([\d,]+\.?\d*)/i);
          const balanceMatch = allText.match(/Balance[^\d]*([\d,]+\.?\d*)/i) || allText.match(/Balance[^M]*Me?\$?\s*([\d,]+\.?\d*)/i);
          const total = totalMatch ? parseFloat(totalMatch[1].replace(/,/g, '')) : 0;
          const paid = paidMatch ? parseFloat(paidMatch[1].replace(/,/g, '')) : 0;
          const balance = balanceMatch ? parseFloat(balanceMatch[1].replace(/,/g, '')) : 0;
          const statusText = allText.toLowerCase();
          let status = 'pending';
          if (statusText.includes('confirm')) status = 'confirmed';
          if (statusText.includes('check-in')) status = 'checked-in';
          if (statusText.includes('check-out')) status = 'checked-out';
          if (statusText.includes('cancel')) status = 'cancelled';
          if (!nombre && !bookingId) return null;
          if (nombre && !isValidName(nombre)) nombre = '';
          if (!nombre && bookingId && checkInDate) nombre = 'Unknown';
          
          return {
            nombre: nombre || 'Unknown',
            bookingId: bookingId || null,
            checkInDate,
            checkOutDate,
            checkInTime,
            checkOutTime,
            bookingDate,
            noches,
            adultos,
            ninos,
            personas,
            habitacion,
            total,
            paid,
            balance,
            status
          };
        } catch (e) { return null; }
      };
      
      let cards = Array.from(document.querySelectorAll('.MuiCard-root'));
      if (cards.length === 0) cards = Array.from(document.querySelectorAll('.MuiPaper-root'));
      if (cards.length === 0) cards = Array.from(document.querySelectorAll('div[class*="sc-"]'));
      
      const arrivals = [];
      cards.forEach(card => {
        const text = card.textContent || '';
        const isReservationCard = (
          text.includes('Nights') && 
          (text.includes('Booking Date') || text.match(/\d{2}\/\d{2}\/\d{4}/)) &&
          (text.includes('Total') || text.includes('Me$') || text.includes('Mex$'))
        );
        if (isReservationCard) {
          const reservation = extractReservation(card);
          if (reservation && (reservation.nombre !== 'Unknown' || reservation.bookingId || reservation.checkInDate)) {
            arrivals.push(reservation);
          }
        }
      });
      return arrivals;
    });
    
    console.log(`✅ Found ${results.arrivals.length} arrivals`);

    // ==================== DEPARTURES ====================
    console.log('\n🚪 Scraping DEPARTURES...');
    await page.evaluate(() => {
      const tabs = Array.from(document.querySelectorAll('div.ant-tabs-tab, button[role="tab"]'));
      const departuresTab = tabs.find(tab => tab.textContent.includes('Departures'));
      if (departuresTab) departuresTab.click();
    });
    
    await page.waitForTimeout(3000);
    
    results.departures = await page.evaluate(() => {
      const invalidNames = [
        'Make Group', 'Export', 'Search', 'Mini Rooms', 'Illusion',
        'Reservations', 'Arrivals', 'Departures', 'In-house',
        'Booking Date', 'Total', 'Paid', 'Balance', 'Nights',
        'Room', 'Check', 'Confirm', 'Assign Room'
      ];
      
      const isValidName = (name) => {
        if (!name || name.length < 3) return false;
        const lowerName = name.toLowerCase();
        return !invalidNames.some(invalid => lowerName.includes(invalid.toLowerCase()));
      };
      
      const extractReservation = (card) => {
        try {
          const allText = card.textContent || '';
          const hasRequiredData = (
            allText.includes('Nights') && 
            (allText.includes('Booking Date') || allText.match(/\d{2}\/\d{2}\/\d{4}/)) &&
            (allText.includes('Total') || allText.includes('Me$') || allText.includes('Mex$'))
          );
          if (!hasRequiredData) return null;
          if (card.tagName === 'BUTTON' || card.closest('button') || card.closest('header') ||
              (allText.includes('Make Group') && !allText.includes('Nights'))) return null;
          
          let nombre = '';
          const nameElements = card.querySelectorAll('h6, .MuiTypography-h6, [class*="Typography-h6"]');
          for (const el of nameElements) {
            const text = el.textContent?.trim() || '';
            if (isValidName(text) && text.length > 3 && text.length < 60) {
              nombre = text;
              break;
            }
          }
          if (!nombre) {
            const titleMatch = allText.match(/(?:Mr\.|Ms\.|Mrs\.|Dr\.|Miss|Mister)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,4})/);
            if (titleMatch && isValidName(titleMatch[0])) nombre = titleMatch[0].trim();
          }
          if (!nombre) {
            const namePattern = /([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})/g;
            const matches = allText.match(namePattern);
            if (matches) {
              for (const match of matches) {
                const trimmed = match.trim();
                if (isValidName(trimmed) && trimmed.length > 5 && trimmed.length < 50) {
                  nombre = trimmed;
                  break;
                }
              }
            }
          }
          if (!nombre) {
            const lines = allText.split(/\n|(?:\s{2,})/).filter(l => l.trim());
            for (const line of lines.slice(0, 8)) {
              const trimmed = line.trim();
              if (isValidName(trimmed) && trimmed.length > 5 && trimmed.length < 50 && 
                  /^[A-Z]/.test(trimmed) && !trimmed.match(/^\d|^\d{2}\/\d{2}\/\d{4}/)) {
                nombre = trimmed;
                break;
              }
            }
          }
          
          let bookingId = '';
          const bookingIdElements = card.querySelectorAll('.MuiTypography-body2, [class*="Typography-body2"]');
          for (const el of bookingIdElements) {
            const text = el.textContent?.trim() || '';
            if (text.match(/\d+\s*[|]\s*[A-Z0-9/]+/)) {
              bookingId = text;
              break;
            }
          }
          
          const dateMatches = allText.match(/(\d{2}\/\d{2}\/\d{4})/g) || [];
          const checkInDate = dateMatches[0] || null;
          const checkOutDate = dateMatches[1] || null;
          const bookingDate = dateMatches[2] || null;
          const timeMatches = allText.match(/(\d{1,2}:\d{2}:\d{2}\s*(?:AM|PM))/gi) || [];
          const checkInTime = timeMatches[0] || null;
          const checkOutTime = timeMatches[1] || null;
          const nightsMatch = allText.match(/(\d+)\s*Nights?/i);
          const noches = nightsMatch ? parseInt(nightsMatch[1]) : 0;
          
          let adultos = 0;
          let ninos = 0;
          const adultIcons = card.querySelectorAll('[id*="adult"], [id*="Adult"], [alt*="adult"], [alt*="Adult"], [class*="adult"], [class*="Adult"]');
          const childIcons = card.querySelectorAll('[id*="child"], [id*="Child"], [alt*="child"], [alt*="Child"], [class*="child"], [class*="Child"]');
          if (adultIcons.length > 0) {
            adultIcons.forEach(icon => {
              const nextSibling = icon.nextSibling;
              if (nextSibling && nextSibling.textContent) {
                const num = parseInt(nextSibling.textContent.trim());
                if (!isNaN(num) && num > 0) adultos = num;
              }
              const parent = icon.parentElement;
              if (parent) {
                const parentText = parent.textContent || '';
                const match = parentText.match(/(\d+)\s*(?:Adults?|Adult)/i);
                if (match) adultos = parseInt(match[1]);
              }
            });
          }
          if (childIcons.length > 0) {
            childIcons.forEach(icon => {
              const nextSibling = icon.nextSibling;
              if (nextSibling && nextSibling.textContent) {
                const num = parseInt(nextSibling.textContent.trim());
                if (!isNaN(num) && num >= 0) ninos = num;
              }
              const parent = icon.parentElement;
              if (parent) {
                const parentText = parent.textContent || '';
                const match = parentText.match(/(\d+)\s*(?:Child|Children)/i);
                if (match) ninos = parseInt(match[1]);
              }
            });
          }
          if (adultos === 0) {
            const adultsMatch = allText.match(/(\d+)\s*(?:Adults?|Adult)/i);
            if (adultsMatch) adultos = parseInt(adultsMatch[1]);
          }
          if (ninos === 0) {
            const childrenMatch = allText.match(/(\d+)\s*(?:Child|Children)/i);
            if (childrenMatch) ninos = parseInt(childrenMatch[1]);
          }
          if (adultos === 0 && ninos === 0) {
            const guestPattern = allText.match(/(\d+)\s+(\d+)\s*(?:Room|Adults?|Person)/i);
            if (guestPattern) {
              adultos = parseInt(guestPattern[1]);
              ninos = parseInt(guestPattern[2]);
            }
          }
          const personas = adultos + ninos;
          const roomMatch = allText.match(/S\s*(\d+)/i) || allText.match(/Room\s*Type[^/]*\/\s*([^/]+)/i);
          const habitacion = roomMatch ? (roomMatch[0].includes('S ') ? `S ${roomMatch[1]}` : roomMatch[1].trim()) : null;
          const totalMatch = allText.match(/Total[^\d]*([\d,]+\.?\d*)/i) || allText.match(/Total[^M]*Me?\$?\s*([\d,]+\.?\d*)/i);
          const paidMatch = allText.match(/Paid[^\d]*([\d,]+\.?\d*)/i) || allText.match(/Paid[^M]*Me?\$?\s*([\d,]+\.?\d*)/i);
          const balanceMatch = allText.match(/Balance[^\d]*([\d,]+\.?\d*)/i) || allText.match(/Balance[^M]*Me?\$?\s*([\d,]+\.?\d*)/i);
          const total = totalMatch ? parseFloat(totalMatch[1].replace(/,/g, '')) : 0;
          const paid = paidMatch ? parseFloat(paidMatch[1].replace(/,/g, '')) : 0;
          const balance = balanceMatch ? parseFloat(balanceMatch[1].replace(/,/g, '')) : 0;
          const statusText = allText.toLowerCase();
          let status = 'pending';
          if (statusText.includes('confirm')) status = 'confirmed';
          if (statusText.includes('check-in')) status = 'checked-in';
          if (statusText.includes('check-out')) status = 'checked-out';
          if (statusText.includes('cancel')) status = 'cancelled';
          if (!nombre && !bookingId) return null;
          if (nombre && !isValidName(nombre)) nombre = '';
          if (!nombre && bookingId && checkInDate) nombre = 'Unknown';
          
          return {
            nombre: nombre || 'Unknown',
            bookingId: bookingId || null,
            checkInDate,
            checkOutDate,
            checkInTime,
            checkOutTime,
            bookingDate,
            noches,
            adultos,
            ninos,
            personas,
            habitacion,
            total,
            paid,
            balance,
            status
          };
        } catch (e) { return null; }
      };
      
      let cards = Array.from(document.querySelectorAll('.MuiCard-root'));
      if (cards.length === 0) cards = Array.from(document.querySelectorAll('.MuiPaper-root'));
      if (cards.length === 0) cards = Array.from(document.querySelectorAll('div[class*="sc-"]'));
      
      const departures = [];
      cards.forEach(card => {
        const text = card.textContent || '';
        const isReservationCard = (
          text.includes('Nights') && 
          (text.includes('Booking Date') || text.match(/\d{2}\/\d{2}\/\d{4}/)) &&
          (text.includes('Total') || text.includes('Me$') || text.includes('Mex$'))
        );
        if (isReservationCard) {
          const reservation = extractReservation(card);
          if (reservation && (reservation.nombre !== 'Unknown' || reservation.bookingId || reservation.checkInDate)) {
            departures.push(reservation);
          }
        }
      });
      return departures;
    });
    
    console.log(`✅ Found ${results.departures.length} departures`);

    // ==================== IN-HOUSE ====================
    console.log('\n🏨 Scraping IN-HOUSE...');
    await page.evaluate(() => {
      const tabs = Array.from(document.querySelectorAll('div.ant-tabs-tab, button[role="tab"]'));
      const inhouseTab = tabs.find(tab => tab.textContent.includes('In-house'));
      if (inhouseTab) inhouseTab.click();
    });
    
    await page.waitForTimeout(3000);
    
    results.inhouse = await page.evaluate(() => {
      const invalidNames = [
        'Make Group', 'Export', 'Search', 'Mini Rooms', 'Illusion',
        'Reservations', 'Arrivals', 'Departures', 'In-house',
        'Booking Date', 'Total', 'Paid', 'Balance', 'Nights',
        'Room', 'Check', 'Confirm', 'Assign Room'
      ];
      
      const isValidName = (name) => {
        if (!name || name.length < 3) return false;
        const lowerName = name.toLowerCase();
        return !invalidNames.some(invalid => lowerName.includes(invalid.toLowerCase()));
      };
      
      const extractReservation = (card) => {
        try {
          const allText = card.textContent || '';
          const hasRequiredData = (
            allText.includes('Nights') && 
            (allText.includes('Booking Date') || allText.match(/\d{2}\/\d{2}\/\d{4}/)) &&
            (allText.includes('Total') || allText.includes('Me$') || allText.includes('Mex$'))
          );
          if (!hasRequiredData) return null;
          if (card.tagName === 'BUTTON' || card.closest('button') || card.closest('header') ||
              (allText.includes('Make Group') && !allText.includes('Nights'))) return null;
          
          let nombre = '';
          const nameElements = card.querySelectorAll('h6, .MuiTypography-h6, [class*="Typography-h6"]');
          for (const el of nameElements) {
            const text = el.textContent?.trim() || '';
            if (isValidName(text) && text.length > 3 && text.length < 60) {
              nombre = text;
              break;
            }
          }
          if (!nombre) {
            const titleMatch = allText.match(/(?:Mr\.|Ms\.|Mrs\.|Dr\.|Miss|Mister)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,4})/);
            if (titleMatch && isValidName(titleMatch[0])) nombre = titleMatch[0].trim();
          }
          if (!nombre) {
            const namePattern = /([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})/g;
            const matches = allText.match(namePattern);
            if (matches) {
              for (const match of matches) {
                const trimmed = match.trim();
                if (isValidName(trimmed) && trimmed.length > 5 && trimmed.length < 50) {
                  nombre = trimmed;
                  break;
                }
              }
            }
          }
          if (!nombre) {
            const lines = allText.split(/\n|(?:\s{2,})/).filter(l => l.trim());
            for (const line of lines.slice(0, 8)) {
              const trimmed = line.trim();
              if (isValidName(trimmed) && trimmed.length > 5 && trimmed.length < 50 && 
                  /^[A-Z]/.test(trimmed) && !trimmed.match(/^\d|^\d{2}\/\d{2}\/\d{4}/)) {
                nombre = trimmed;
                break;
              }
            }
          }
          
          let bookingId = '';
          const bookingIdElements = card.querySelectorAll('.MuiTypography-body2, [class*="Typography-body2"]');
          for (const el of bookingIdElements) {
            const text = el.textContent?.trim() || '';
            if (text.match(/\d+\s*[|]\s*[A-Z0-9/]+/)) {
              bookingId = text;
              break;
            }
          }
          
          const dateMatches = allText.match(/(\d{2}\/\d{2}\/\d{4})/g) || [];
          const checkInDate = dateMatches[0] || null;
          const checkOutDate = dateMatches[1] || null;
          const bookingDate = dateMatches[2] || null;
          const timeMatches = allText.match(/(\d{1,2}:\d{2}:\d{2}\s*(?:AM|PM))/gi) || [];
          const checkInTime = timeMatches[0] || null;
          const checkOutTime = timeMatches[1] || null;
          const nightsMatch = allText.match(/(\d+)\s*Nights?/i);
          const noches = nightsMatch ? parseInt(nightsMatch[1]) : 0;
          
          let adultos = 0;
          let ninos = 0;
          const adultIcons = card.querySelectorAll('[id*="adult"], [id*="Adult"], [alt*="adult"], [alt*="Adult"], [class*="adult"], [class*="Adult"]');
          const childIcons = card.querySelectorAll('[id*="child"], [id*="Child"], [alt*="child"], [alt*="Child"], [class*="child"], [class*="Child"]');
          if (adultIcons.length > 0) {
            adultIcons.forEach(icon => {
              const nextSibling = icon.nextSibling;
              if (nextSibling && nextSibling.textContent) {
                const num = parseInt(nextSibling.textContent.trim());
                if (!isNaN(num) && num > 0) adultos = num;
              }
              const parent = icon.parentElement;
              if (parent) {
                const parentText = parent.textContent || '';
                const match = parentText.match(/(\d+)\s*(?:Adults?|Adult)/i);
                if (match) adultos = parseInt(match[1]);
              }
            });
          }
          if (childIcons.length > 0) {
            childIcons.forEach(icon => {
              const nextSibling = icon.nextSibling;
              if (nextSibling && nextSibling.textContent) {
                const num = parseInt(nextSibling.textContent.trim());
                if (!isNaN(num) && num >= 0) ninos = num;
              }
              const parent = icon.parentElement;
              if (parent) {
                const parentText = parent.textContent || '';
                const match = parentText.match(/(\d+)\s*(?:Child|Children)/i);
                if (match) ninos = parseInt(match[1]);
              }
            });
          }
          if (adultos === 0) {
            const adultsMatch = allText.match(/(\d+)\s*(?:Adults?|Adult)/i);
            if (adultsMatch) adultos = parseInt(adultsMatch[1]);
          }
          if (ninos === 0) {
            const childrenMatch = allText.match(/(\d+)\s*(?:Child|Children)/i);
            if (childrenMatch) ninos = parseInt(childrenMatch[1]);
          }
          if (adultos === 0 && ninos === 0) {
            const guestPattern = allText.match(/(\d+)\s+(\d+)\s*(?:Room|Adults?|Person)/i);
            if (guestPattern) {
              adultos = parseInt(guestPattern[1]);
              ninos = parseInt(guestPattern[2]);
            }
          }
          const personas = adultos + ninos;
          const roomMatch = allText.match(/S\s*(\d+)/i) || allText.match(/Room\s*Type[^/]*\/\s*([^/]+)/i);
          const habitacion = roomMatch ? (roomMatch[0].includes('S ') ? `S ${roomMatch[1]}` : roomMatch[1].trim()) : null;
          const totalMatch = allText.match(/Total[^\d]*([\d,]+\.?\d*)/i) || allText.match(/Total[^M]*Me?\$?\s*([\d,]+\.?\d*)/i);
          const paidMatch = allText.match(/Paid[^\d]*([\d,]+\.?\d*)/i) || allText.match(/Paid[^M]*Me?\$?\s*([\d,]+\.?\d*)/i);
          const balanceMatch = allText.match(/Balance[^\d]*([\d,]+\.?\d*)/i) || allText.match(/Balance[^M]*Me?\$?\s*([\d,]+\.?\d*)/i);
          const total = totalMatch ? parseFloat(totalMatch[1].replace(/,/g, '')) : 0;
          const paid = paidMatch ? parseFloat(paidMatch[1].replace(/,/g, '')) : 0;
          const balance = balanceMatch ? parseFloat(balanceMatch[1].replace(/,/g, '')) : 0;
          const statusText = allText.toLowerCase();
          let status = 'pending';
          if (statusText.includes('confirm')) status = 'confirmed';
          if (statusText.includes('check-in')) status = 'checked-in';
          if (statusText.includes('check-out')) status = 'checked-out';
          if (statusText.includes('cancel')) status = 'cancelled';
          if (!nombre && !bookingId) return null;
          if (nombre && !isValidName(nombre)) nombre = '';
          if (!nombre && bookingId && checkInDate) nombre = 'Unknown';
          
          return {
            nombre: nombre || 'Unknown',
            bookingId: bookingId || null,
            checkInDate,
            checkOutDate,
            checkInTime,
            checkOutTime,
            bookingDate,
            noches,
            adultos,
            ninos,
            personas,
            habitacion,
            total,
            paid,
            balance,
            status
          };
        } catch (e) { return null; }
      };
      
      let cards = Array.from(document.querySelectorAll('.MuiCard-root'));
      if (cards.length === 0) cards = Array.from(document.querySelectorAll('.MuiPaper-root'));
      if (cards.length === 0) cards = Array.from(document.querySelectorAll('div[class*="sc-"]'));
      
      const inhouse = [];
      cards.forEach(card => {
        const text = card.textContent || '';
        const isReservationCard = (
          text.includes('Nights') && 
          (text.includes('Booking Date') || text.match(/\d{2}\/\d{2}\/\d{4}/)) &&
          (text.includes('Total') || text.includes('Me$') || text.includes('Mex$'))
        );
        if (isReservationCard) {
          const reservation = extractReservation(card);
          if (reservation && (reservation.nombre !== 'Unknown' || reservation.bookingId || reservation.checkInDate)) {
            inhouse.push(reservation);
          }
        }
      });
      return inhouse;
    });
    
    console.log(`✅ Found ${results.inhouse.length} in-house guests`);

    // ==================== STAYVIEW ====================
    console.log('\n📅 Scraping STAYVIEW...');
    await page.goto('https://live.ipms247.com/frontoffice/stayview', {
      waitUntil: 'networkidle2',
      timeout: 60000
    });
    
    await page.waitForTimeout(5000);
    
    const stayviewData = await page.evaluate(() => {
      const data = {
        occupancy: [],
        availability: [],
        stats: {}
      };
      
      // Extraer estadísticas del header
      try {
        const statElements = document.querySelectorAll('[class*="stat"], .badge, [class*="count"]');
        const allStatsText = Array.from(statElements).map(el => el.textContent?.trim()).join(' ');
        
        // Extraer números de las estadísticas
        const allMatch = allStatsText.match(/All[^\d]*(\d+)/i);
        const vacantMatch = allStatsText.match(/Vacant[^\d]*(\d+)/i);
        const occupiedMatch = allStatsText.match(/Occupied[^\d]*(\d+)/i);
        const reservedMatch = allStatsText.match(/Reserved[^\d]*(\d+)/i);
        const blockedMatch = allStatsText.match(/Blocked[^\d]*(\d+)/i);
        const dueOutMatch = allStatsText.match(/Due\s*Out[^\d]*(\d+)/i);
        const dirtyMatch = allStatsText.match(/Dirty[^\d]*(\d+)/i);
        
        data.stats = {
          all: allMatch ? parseInt(allMatch[1]) : 0,
          vacant: vacantMatch ? parseInt(vacantMatch[1]) : 0,
          occupied: occupiedMatch ? parseInt(occupiedMatch[1]) : 0,
          reserved: reservedMatch ? parseInt(reservedMatch[1]) : 0,
          blocked: blockedMatch ? parseInt(blockedMatch[1]) : 0,
          dueOut: dueOutMatch ? parseInt(dueOutMatch[1]) : 0,
          dirty: dirtyMatch ? parseInt(dirtyMatch[1]) : 0
        };
      } catch (e) {
        console.error('Error extracting stats:', e);
      }
      
      // Extraer Room Availability
      try {
        const availabilityRow = Array.from(document.querySelectorAll('td.ant-table-cell')).find(
          cell => cell.textContent?.includes('Room Availability')
        );
        
        if (availabilityRow) {
          const row = availabilityRow.closest('tr');
          const cells = row?.querySelectorAll('td.ant-table-cell.occupancy-cell, td.ant-table-cell.ant-table-cell-ellipsis');
          
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

