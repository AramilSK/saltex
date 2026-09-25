/* ══════════════════════════════════════════════════════
   САЛТЕКС — страница корзины.

   Корзина хранит только артикул и вес (см. core.js).
   Названия, характеристики и цены подтягиваются из той же
   выгрузки, что и каталог, а рубли считаются по текущему
   курсу ЦБ +5% — поэтому вчерашние цифры не залёживаются.
   ══════════════════════════════════════════════════════ */
(function(){
  'use strict';

  var S = window.SALTEKS;
  var C = window.SALTEKS_CATALOG;
  if (!S || !C || document.body.dataset.page !== 'cart') return;

  var list  = document.getElementById('list');
  var side  = document.getElementById('side');
  var empty = document.getElementById('empty');
  var fail  = document.getElementById('fail');
  var count = document.getElementById('count');
  var draft = document.getElementById('draft');

  var byId = {};      /* артикул → позиция каталога */

  function texture(){
    return '<div class="fabric-tex"></div>';
  }

  /* Экранный оттенок по номеру пантона. В корзине хранится только
     номер — сам цвет живёт в общей палитре. Если палитра не
     подключилась, образец рисуем нейтральным, а номер всё равно
     показываем: он и есть точное обозначение. */
  var PALETTE = (window.SALTEKS_COLORS && window.SALTEKS_COLORS.colors) || [];
  function hexOf(code){
    for (var i = 0; i < PALETTE.length; i++) {
      if (PALETTE[i].k === code) return PALETTE[i].h;
    }
    return '#8D8F8F';
  }
  /* Номер в палитре компании: в корзине хранится код пантона,
     а заказывают по номеру — показываем оба. */
  function numOf(code){
    for (var i = 0; i < PALETTE.length; i++) {
      if (PALETTE[i].k === code) return PALETTE[i].p;
    }
    return '';
  }

  /* Цен в списке нет (ТЗ каталог 3 и 17): корзина собирает запрос
     менеджеру — позиции, цвет и объём, а цену называет менеджер. */
  function rowHTML(p, kg){
    var meters = p.mPerKg ? kg * p.mPerKg : 0;

    /* Состав и метраж могут быть ещё не заполнены — собираем
       подпись только из того, что есть. */
    var spec = [
      p.composition && p.composition !== '—' ? p.composition : null,
      p.densityLabel && p.densityLabel !== '—' ? p.densityLabel + ' г/м²' : null,
      p.mPerKg ? S.num1(p.mPerKg) + ' м/кг' : null
    ].filter(Boolean).join(' · ');

    /* Цвет необязателен: если его не выбрали, так и пишем —
       менеджер согласует по карте. Рядом с номером ставим образец:
       по одному пантону оттенок не представить. */
    var code = S.cart.colorOf(p.id);
    var colorLine = code
      ? '<p class="crow__color"><i style="background:' + S.esc(hexOf(code)) +
        '" aria-hidden="true"></i>№ ' + S.esc(numOf(code)) + ' · ' + S.esc(code) + '</p>'
      : '<p class="crow__color crow__color--none">цвет не выбран</p>';

    return '<div class="crow" data-id="' + S.esc(p.id) + '">' +
      '<a class="crow__media" href="product.html?id=' + encodeURIComponent(p.id) + '"' +
        ' aria-label="' + S.esc(p.name) + '">' +
        texture() +
        (C.PHOTOS && p.photo
          ? '<img src="' + S.esc(p.photo) + '" alt="" loading="lazy" decoding="async">' : '') +
      '</a>' +

      '<div class="crow__body">' +
        '<a class="crow__name" href="product.html?id=' + encodeURIComponent(p.id) + '">' +
          S.esc(p.name) + '</a>' +
        colorLine +
        '<p class="crow__spec">' + S.esc(spec) + '</p>' +
      '</div>' +

      /* Количество задаётся в метрах, вес показываем справочно.
         Внутри корзина по-прежнему хранит килограммы: по ним
         считается рулон и по ним работает склад. */
      '<div class="crow__qty">' +
        '<label class="vh" for="q-' + S.esc(p.id) + '">' +
          (p.mPerKg ? 'Метраж, м' : 'Вес, кг') + '</label>' +
        '<div class="crow__stepper">' +
          '<button type="button" data-step="-1" data-id="' + S.esc(p.id) + '" aria-label="Убрать рулон">−</button>' +
          '<input id="q-' + S.esc(p.id) + '" type="number" min="1" step="1" inputmode="numeric"' +
            ' value="' + (p.mPerKg ? Math.round(meters) : kg) + '" data-qty="' + S.esc(p.id) + '">' +
          '<button type="button" data-step="1" data-id="' + S.esc(p.id) + '" aria-label="Добавить рулон">+</button>' +
        '</div>' +
        '<p class="crow__hint">' +
          (p.mPerKg ? 'м · ≈ ' + S.num0(kg) + ' кг' : 'кг') + '</p>' +
      '</div>' +

      '<div class="crow__sum">' +
        '<button class="crow__drop" type="button" data-drop="' + S.esc(p.id) + '">Удалить</button>' +
      '</div>' +
    '</div>';
  }

  function render(){
    var items = S.cart.items();

    /* Позиция могла уйти из выгрузки, пока лежала в корзине.
       Молча её не выбрасываем — но и посчитать не можем. */
    var known = items.filter(function(r){ return byId[r.id]; });
    var lost = items.length - known.length;

    empty.hidden = items.length !== 0;
    side.hidden  = known.length === 0;

    if (!items.length) {
      list.innerHTML = '';
      count.textContent = 'пусто';
      return;
    }

    list.innerHTML = known.map(function(r){
      return rowHTML(byId[r.id], r.kg);
    }).join('') + (lost
      ? '<p class="cart__lost">' + lost + ' ' +
        S.cart.plural(lost, 'позиция больше не значится', 'позиции больше не значатся',
                      'позиций больше не значатся') +
        ' в каталоге — их убрали из расчёта. Уточните наличие у менеджера.</p>'
      : '');

    var totalKg = 0, totalM = 0;
    known.forEach(function(r){
      var p = byId[r.id];
      totalKg += r.kg;
      totalM  += p.mPerKg ? r.kg * p.mPerKg : 0;
    });

    document.getElementById('t-count').textContent = known.length;
    document.getElementById('t-kg').textContent  = S.num0(totalKg) + ' кг';
    document.getElementById('t-m').textContent   = totalM ? S.num0(totalM) + ' м' : '—';

    count.innerHTML = '<b>' + known.length + '</b> ' +
      S.cart.plural(known.length, 'позиция', 'позиции', 'позиций');
  }

  /* ── Управление количеством ── */
  list.addEventListener('click', function(e){
    var step = e.target.closest('[data-step]');
    if (step) {
      var p = byId[step.dataset.id];
      if (!p) return;
      /* шаг — рулон: партии считают рулонами, а не килограммами */
      var next = S.cart.qty(step.dataset.id) + Number(step.dataset.step) * p.roll_kg_avg;
      S.cart.setQty(step.dataset.id, Math.max(1, next));
      return;
    }
    var drop = e.target.closest('[data-drop]');
    if (drop) S.cart.remove(drop.dataset.drop);
  });

  list.addEventListener('change', function(e){
    var input = e.target.closest('[data-qty]');
    if (!input) return;
    var p = byId[input.dataset.qty];
    var val = Number(input.value);
    if (!(val > 0)) { render(); return; }   /* мусор в поле — откатываем */
    /* В поле метры, в корзине килограммы — переводим по пм/кг
       позиции. Без пм/кг поле так и остаётся весом. */
    var kg = (p && p.mPerKg) ? val / p.mPerKg : val;
    S.cart.setQty(input.dataset.qty, Math.max(1, Math.round(kg)));
  });

  /* ── Очистка в два шага ──
     Список собирают по одной позиции, а стереть его случайным
     кликом можно мгновенно, поэтому спрашиваем подтверждение. */
  var clearBtn = document.getElementById('clear');
  var confirmBox = document.getElementById('confirm');
  var undoTimer = null;

  function askClear(on){
    clearTimeout(undoTimer);
    clearBtn.hidden = on;
    confirmBox.hidden = !on;
    if (on) {
      document.getElementById('clear-no').focus();
      /* передумал и ушёл на другую часть страницы — вопрос снимается сам */
      undoTimer = setTimeout(function(){ askClear(false); }, 8000);
    }
  }

  clearBtn.addEventListener('click', function(){
    if (!S.cart.count()) return;
    askClear(true);
  });
  document.getElementById('clear-no').addEventListener('click', function(){
    askClear(false);
    clearBtn.focus();
  });
  document.getElementById('clear-yes').addEventListener('click', function(){
    askClear(false);
    S.cart.clear();
  });

  /* ── Заявка ──
     Список позиций уходит темой в ту же модалку, что и прайс:
     отдельная форма здесь только запутала бы. */
  document.getElementById('send').addEventListener('click', function(){
    var lines = S.cart.items().filter(function(r){ return byId[r.id]; }).map(function(r){
      var p = byId[r.id];
      var code = r.color ? ' · цвет № ' + numOf(r.color) + ' (' + r.color + ')' : ' · цвет не выбран';
      return p.name + ' · ' + p.densityLabel + ' г/м²' + code + ' · ' +
             S.num0(r.kg) + ' кг · арт. ' + (p.sku || p.id);
    });
    if (!lines.length) return;
    S.openLead('Заявка из корзины, ' + lines.length + ' поз.:\n' + lines.join('\n'),
               'Отправить заявку');
  });

  /* После отправки корзину чистим: заявка ушла, держать список незачем */
  S.onLeadSent(function(){ if (S.cart.count()) S.cart.clear(); });

  /* Пересчёт при смене количества, курса и правках из другой вкладки */
  S.cart.onChange(render);
  document.addEventListener('saltex:fx', render);

  /* ── Загрузка ── */
  C.load().then(function(d){
    d.products.forEach(function(p){ byId[p.id] = p; });
    if (draft) draft.hidden = d.source !== 'mock';
    render();
  }).catch(function(err){
    fail.hidden = false;
    count.textContent = '';
    console.error('[корзина] не удалось загрузить каталог:', err);
  });
})();
