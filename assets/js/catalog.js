/* ══════════════════════════════════════════════════════
   САЛТЕКС — каталог.

   Отвечает за три вещи:
   1) загрузку ассортимента (сейчас — макет 1С, потом — выгрузка),
   2) единый шаблон карточки, общий для каталога и главной,
   3) фильтры, поиск, сортировку и пагинацию на catalog.html.

   Цены хранятся в долларах и пересчитываются в рубли
   по курсу из шапки — см. core.js.
   ══════════════════════════════════════════════════════ */
(function(){
  'use strict';

  var S = window.SALTEKS;

  /* ══════════════════════════════════════════════════
     ИНТЕГРАЦИЯ С 1С
     Чтобы подключить реальную выгрузку, меняются только
     CATALOG_ENDPOINT и тело fromErp. Остальной код
     работает с внутренней моделью и не знает про 1С.
     ══════════════════════════════════════════════════ */
  var CATALOG_ENDPOINT = 'data/catalog.json';

  /* Есть ли реальные фотографии полотна в img/fabric/.
     Пока съёмки нет, карточки рисуют фактуру цветом позиции;
     после загрузки файлов поставить true. */
  var PHOTOS = false;

  var PAGE = 24;          /* сколько карточек показывать за раз */

  /* Приведение выгрузки к внутренней модели.
     Ожидаемые поля описаны в data/catalog.json. Если 1С отдаёт
     XML/CommerceML или другие имена полей — переписывается
     только эта функция. */
  function fromErp(raw){
    if (!raw || !Array.isArray(raw.products)) throw new Error('в выгрузке нет products');

    var types = (raw.types || []).map(function(t){
      return {
        id: String(t.id),
        name: String(t.name),
        roll_kg_avg: Number(t.roll_kg_avg) || 20,
        order: Number(t.order) || 99,
        /* вид без позиций в прайсе: кнопка есть, вместо сетки —
           панель «изготовим под заказ» (ТЗ 1.9) */
        onOrder: !!t.on_order
      };
    }).sort(function(a,b){ return a.order - b.order; });

    var typeById = {};
    types.forEach(function(t){ typeById[t.id] = t; });

    var products = raw.products.map(function(p){
      var type = typeById[p.type];
      return {
        id:          String(p.id),
        sku:         p.sku || '',
        type:        String(p.type),
        typeName:    type ? type.name : String(p.type),
        name:        String(p.name || ''),
        kicker:      p.kicker || '',
        composition: p.composition || '—',
        quality:     p.quality || '—',
        width:       p.width || '—',
        /* форма отгрузки — из колонки ширины прайса: «185 (рулон)»
           против «100*2 (пачка)». Ею управляются формулировки
           калькулятора (ТЗ 2.3). */
        form:        p.form === 'пачка' ? 'пачка' : 'рулон',
        density:     Number(p.density) || 0,
        densityLabel:p.density_label || (p.density != null ? String(p.density) : '—'),
        mPerKg:      Number(p.m_per_kg) || 0,
        m_per_kg:    Number(p.m_per_kg) || 0,     /* имя, которое ждёт SALTEKS.calc */
        companion:   p.companion || '—',
        /* Цена — пара «до 250 / от 250». Старая выгрузка отдавала
           одно число price_usd_kg: принимаем и её, чтобы данные
           прошлой версии не роняли каталог. */
        price: {
          base:         Number(p.price && p.price.base) || Number(p.price_usd_kg) || 0,
          bulk:         (p.price && p.price.bulk != null) ? Number(p.price.bulk) : null,
          bulk_from_kg: Number(p.price && p.price.bulk_from_kg) || 250
        },
        roll_kg_avg:  Number(p.roll_kg_avg) || (type ? type.roll_kg_avg : 20),
        photo:        p.photo || ''
      };
    }).filter(function(p){ return p.id && p.price.base > 0; });

    return {
      source:   raw.source || 'erp',
      updated:  raw.updated || null,
      note:     raw.note || '',
      types:    types,
      products: products
    };
  }

  /* Запасная копия выгрузки, вклеенная скриптом (data/catalog.js).
     Нужна ровно для одного случая — сайт открыли двойным кликом,
     без сервера: по file:// fetch запрещён. На сервере всегда
     читается catalog.json, иначе копия начнёт отставать от него. */
  function offline(){
    return window.SALTEKS_DATA || null;
  }

  var loading = null;
  function load(){
    if (loading) return loading;

    if (location.protocol === 'file:' && offline()) {
      loading = Promise.resolve(fromErp(offline()));
      return loading;
    }

    loading = fetch(CATALOG_ENDPOINT, { cache:'no-cache' })
      .then(function(r){
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(fromErp)
      .catch(function(err){
        var data = offline();
        if (!data) throw err;
        console.warn('[каталог] ' + CATALOG_ENDPOINT + ' недоступен, взята запасная копия:', err.message);
        return fromErp(data);
      });
    return loading;
  }

  /* ══════════════════════════════════════════════════
     КАРТОЧКА
     Порядок полей задан заказчиком: название крупно,
     характеристики мелко, цена за кг крупно и жирно,
     доллары и рулон — мелко.
     ══════════════════════════════════════════════════ */
  /* Фотографий пока нет, у типа больше нет «своего» цвета —
     до съёмки показываем нейтральную фактуру. */
  function media(p){
    var tex = '<div class="fabric-tex"></div>';
    var img = PHOTOS && p.photo
      ? '<img src="' + S.esc(p.photo) + '" alt="' + S.esc(p.name) +
        '" loading="lazy" decoding="async">'
      : '';
    return tex + img;
  }

  /* exact — приехал ли настоящий курс ЦБ. Если нет, считаем по
     кэшу или страховочному значению и честно помечаем цену
     приблизительной, но цифру показываем.

     Показываем обе градации: цену до 250 кг и, если она есть
     в прайсе, оптовую с пометкой (ТЗ 2.4). */
  function priceBlock(p, rate, exact){
    var c = S.calc(p, rate);
    var note = exact
      ? S.usd(c.usdKg) + '/кг по курсу ЦБ +5%'
      : S.usd(c.usdKg) + '/кг · курс уточняется';

    var bulk = c.hasBulk
      ? '<span class="pcard__bulk">от ' + c.bulkFrom + ' кг — ' +
        S.rub0(c.bulkRub) + '/кг, дешевле</span>'
      : '';

    return '<b class="pcard__kg">' + S.rub0(c.baseRub) + ' <small>/кг</small></b>' +
           '<span class="pcard__usd">' + note + '</span>' + bulk;
  }

  function cardHTML(p, rate, i, exact){
    /* Маркеров наличия на карточке нет (ТЗ 1.8), кнопки «в корзину»
       в сетке тоже: из каталога только переход в карточку типа. */
    /* Незаполненные поля прайса пропускаем: строка «Состав —»
       на каждой карточке читается как «состава нет», а это неправда,
       его просто ещё не прислали. */
    var spec = [
      ['Состав',        p.composition],
      ['Плотность',     p.densityLabel ? p.densityLabel + ' г/м²' : null],
      ['Ширина',        p.width === '—' ? null : p.width + ' см'],
      ['Метров в 1 кг', p.mPerKg ? S.num1(p.mPerKg) : null],
      ['Качество',      p.quality]
    ];

    var dl = spec.filter(function(row){
      return row[1] && row[1] !== '—';
    }).map(function(row){
      return '<div><dt>' + row[0] + '</dt><dd>' + S.esc(String(row[1])) + '</dd></div>';
    }).join('');

    return '<li class="pcard rise' + (exact ? '' : ' is-pending') + '" data-id="' + S.esc(p.id) + '"' +
             ' style="--d:' + Math.min((i % 4) * 60, 180) + 'ms">' +
      '<a class="pcard__link" href="product.html?id=' + encodeURIComponent(p.id) + '">' +
        '<div class="pcard__media">' + media(p) + '</div>' +
        '<div class="pcard__body">' +
          '<h3 class="pcard__name">' + S.esc(p.name) +
            '<span>' + S.esc(p.typeName) + '</span></h3>' +
          '<dl class="pcard__spec">' + dl + '</dl>' +
          '<div class="pcard__price">' + priceBlock(p, rate, exact) + '</div>' +
          '<span class="pcard__go">Смотреть</span>' +
        '</div>' +
      '</a></li>';
  }

  /* ── Кладём в корзину ──
     Делегированием на документе: карточки перерисовываются
     при каждой смене фильтра, вешать слушатель на каждую нельзя. */
  document.addEventListener('click', function(e){
    var btn = e.target.closest('[data-add]');
    if (!btn) return;
    e.preventDefault();
    S.cart.add(btn.dataset.add, Number(btn.dataset.kg) || 20);
    btn.classList.add('is-in');
    btn.querySelector('span').textContent = 'В корзине';
  });

  /* Корзину могли очистить на другой вкладке или на самой
     странице корзины — возвращаем кнопкам исходный вид. */
  document.addEventListener('saltex:cart', function(){
    document.querySelectorAll('[data-add]').forEach(function(btn){
      var inCart = S.cart.has(btn.dataset.add);
      btn.classList.toggle('is-in', inCart);
      btn.querySelector('span').textContent = inCart
        ? 'В корзине'
        : 'В корзину · рулон ' + btn.dataset.kg + ' кг';
    });
  });

  /* Перерисовка только цен — вызывается, когда приехал курс ЦБ.
     Полная перерисовка сетки сбросила бы анимацию появления. */
  function repriceAll(list, items, rate){
    var nodes = list.querySelectorAll('.pcard');
    for (var i = 0; i < nodes.length && i < items.length; i++) {
      var box = nodes[i].querySelector('.pcard__price');
      /* сюда попадаем только после ответа ЦБ, значит курс точный */
      if (box) box.innerHTML = priceBlock(items[i], rate, true);
      nodes[i].classList.remove('is-pending');
    }
  }

  /* ══════════════════════════════════════════════════
     СТРАНИЦА КАТАЛОГА
     ══════════════════════════════════════════════════ */
  function initCatalogPage(){
    var list   = document.getElementById('cards');
    var cats   = document.getElementById('cats');
    var count  = document.getElementById('count');
    var more   = document.getElementById('more');
    var moreBtn= document.getElementById('more-btn');
    var empty  = document.getElementById('empty');
    var order  = document.getElementById('onorder');
    var fail   = document.getElementById('fail');
    var draft  = document.getElementById('draft');

    var data = null;
    var shown = PAGE;
    var view = [];

    /* Фильтр одноуровневый (ТЗ 1.3): кнопка вида сразу перестраивает
       сетку, выпадающего подсписка нет. Поиска и сортировки на
       странице нет — на шестнадцати позициях они не нужны, глазами
       быстрее. Порядок карточек всегда один: по виду и плотности. */
    var state = {
      type: 'all'     /* вид полотна */
    };

    /* ── URL как источник правды: ссылку на отфильтрованный
       каталог можно переслать, и она откроется как была ── */
    function readUrl(){
      var u = new URLSearchParams(location.search);
      state.type = u.get('type') || 'all';
    }

    function writeUrl(){
      var u = new URLSearchParams();
      if (state.type !== 'all') u.set('type', state.type);
      var qs = u.toString();
      /* По file:// (сайт открыли двойным кликом, без сервера) браузер
         запрещает replaceState и бросает SecurityError. Ссылку с
         фильтром там всё равно некому переслать, поэтому просто
         пропускаем — каталог обязан отрисоваться в любом случае. */
      try {
        history.replaceState(null, '', qs ? '?' + qs : location.pathname);
      } catch (e) {}
    }

    /* Порядок один и тот же всегда: сначала вид в порядке прайса,
       внутри вида — по возрастанию плотности. */
    var typeOrder = {};

    /* Осторожно с нулём: у первого вида индекс 0, и проверка
       через || увела бы его в конец списка. */
    function rank(id){
      return typeOrder[id] == null ? 99 : typeOrder[id];
    }

    function byTypeThenDensity(a, b){
      var d = rank(a.type) - rank(b.type);
      return d !== 0 ? d : a.density - b.density;
    }

    function matches(p){
      return state.type === 'all' || p.type === state.type;
    }

    /* Список категорий строится один раз: счётчики по типам от фильтров
       не зависят, а перерисовка на каждый клик уносила бы фокус
       с только что нажатой кнопки. */
    function renderCats(){
      if (!cats || !data) return;
      var perType = {};
      data.products.forEach(function(p){ perType[p.type] = (perType[p.type] || 0) + 1; });

      cats.innerHTML =
        '<button type="button" data-type="all" aria-pressed="false">' +
          'Все полотна <i>' + data.products.length + '</i></button>' +
        data.types.map(function(t){
          var n = perType[t.id] || 0;
          /* у видов под заказ позиций нет — счётчик не рисуем,
             иначе кнопка выглядит сломанной */
          return '<button type="button" data-type="' + S.esc(t.id) + '" aria-pressed="false">' +
                 S.esc(t.name) + (n ? ' <i>' + n + '</i>' : '') + '</button>';
        }).join('');
    }

    /* Меняется только отметка активного раздела */
    function syncCats(){
      if (!cats) return;
      cats.querySelectorAll('[data-type]').forEach(function(b){
        b.setAttribute('aria-pressed', String(b.dataset.type === state.type));
      });
    }

    /* Выбран вид без позиций в прайсе — Интерлок, Пике, Кулирка
       набивка. Вместо пустой сетки показываем панель «изготовим
       под заказ», как во второй версии сайта (ТЗ 1.9). */
    function currentType(){
      if (state.type === 'all' || !data) return null;
      return data.types.filter(function(t){ return t.id === state.type; })[0] || null;
    }
    function isOnOrder(){
      var t = currentType();
      return !!(t && t.onOrder);
    }

    function render(reset){
      if (reset) shown = PAGE;

      view = data.products.filter(matches).sort(byTypeThenDensity);

      var slice = view.slice(0, shown);
      /* Считаем сразу по тому курсу, который есть — из кэша или
         страховочному. Прочерк вместо цены на несколько секунд
         (а без сети — навсегда) хуже, чем приблизительная цифра:
         пока ЦБ не ответил, блок цены приглушён классом is-pending,
         а в шапке написано «курс уточняется». */
      var rate = S.rate();
      var exact = S.rateOk();

      list.innerHTML = slice.map(function(p, i){ return cardHTML(p, rate, i, exact); }).join('');
      S.observe(list);

      var onOrder = isOnOrder();
      var t = currentType();

      if (count) {
        count.innerHTML = onOrder
          ? 'изготовим под заказ'
          : '<b>' + view.length + '</b> ' + plural(view.length);
      }
      if (more) more.hidden = onOrder || view.length <= shown;
      if (moreBtn && !onOrder) {
        var left = view.length - shown;
        moreBtn.querySelector('span').textContent =
          'Показать ещё ' + Math.min(PAGE, left) + ' из ' + left;
      }

      /* Пустой вид под заказ и пустая выдача поиска — разные вещи:
         первое штатно, второе означает «ничего не нашлось». */
      if (order) {
        order.hidden = !onOrder;
        if (onOrder && t) {
          var ttl = order.querySelector('[data-order-title]');
          if (ttl) ttl.textContent = t.name + ' — изготовим под заказ';
        }
      }
      if (empty) empty.hidden = onOrder || view.length !== 0;

      /* если настоящий курс приедет позже — пересчитаем цены на месте */
      if (!exact) S.onRate(function(r){ repriceAll(list, slice, r); });
    }

    function plural(n){
      var d10 = n % 10, d100 = n % 100;
      if (d10 === 1 && d100 !== 11) return 'позиция';
      if (d10 >= 2 && d10 <= 4 && (d100 < 10 || d100 >= 20)) return 'позиции';
      return 'позиций';
    }

    function apply(reset){
      writeUrl();
      syncCats();
      render(reset !== false);
    }

    /* После смены раздела пользователь остаётся в середине прежнего
       списка — возвращаем его к началу сетки. */
    function scrollToGrid(){
      var top = list.getBoundingClientRect().top + scrollY - 140;
      if (typeof scrollTo === 'function') {
        scrollTo({ top:top, behavior: S.reduced ? 'auto' : 'smooth' });
      }
    }

    /* ── События ── */
    if (cats) cats.addEventListener('click', function(e){
      var b = e.target.closest('[data-type]');
      if (!b || b.dataset.type === state.type) return;
      state.type = b.dataset.type;
      apply();
      scrollToGrid();
    });

    if (moreBtn) moreBtn.addEventListener('click', function(){
      shown += PAGE;
      render(false);
    });

    /* ── Загрузка ── */
    readUrl();
    load().then(function(d){
      data = d;
      if (draft) draft.hidden = d.source !== 'mock';
      /* порядок видов берём из выгрузки, а не из алфавита */
      d.types.forEach(function(t, i){ typeOrder[t.id] = i; });
      renderCats();
      apply();
    }).catch(function(err){
      if (list) list.innerHTML = '';
      if (fail) fail.hidden = false;
      if (count) count.textContent = '';
      console.error('[каталог] не удалось загрузить ассортимент:', err);
    });
  }

  /* ══════════════════════════════════════════════════
     ГЛАВНАЯ
     Карточек здесь больше нет — каталог живёт только
     на catalog.html. От выгрузки главной нужен один
     список полотен для формы заказа.
     ══════════════════════════════════════════════════ */
  function initHome(){
    var select = document.getElementById('f-fabric');
    if (!select) return;

    load().then(function(d){
      /* Список берётся из той же выгрузки, что и каталог: иначе
         он разойдётся с ассортиментом при первой правке прайса.
         Цвет здесь не нужен — его выбирают в цветовой карте ниже. */
      var names = [];
      d.products.forEach(function(p){
        var label = p.name + (p.densityLabel ? ' · ' + p.densityLabel + ' г/м²' : '');
        if (names.indexOf(label) === -1) names.push(label);
      });
      select.innerHTML += names.map(function(n){
        return '<option value="' + S.esc(n) + '">' + S.esc(n) + '</option>';
      }).join('');
    }).catch(function(err){
      /* не критично: остаётся вариант «Выберите из каталога»
         и поле «Комментарий», менеджер уточнит */
      console.error('[главная] не удалось загрузить список полотен:', err);
    });
  }

  /* ── Экспорт для product.js ── */
  window.SALTEKS_CATALOG = {
    load: load,
    cardHTML: cardHTML,
    PHOTOS: PHOTOS,
    ENDPOINT: CATALOG_ENDPOINT
  };

  var page = document.body.dataset.page;
  if (page === 'catalog') initCatalogPage();
  if (page === 'home') initHome();
})();
