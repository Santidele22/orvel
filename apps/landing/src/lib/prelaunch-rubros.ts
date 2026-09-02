export const FORBIDDEN_VISITOR_JARGON =
  /\b(walk-in|no-show|buffers?|cta|saas)\b/i;

export const PRELAUNCH_RUBRO_IDS = ['peluqueria', 'unas', 'barberia', 'masajes'] as const;

export type PrelaunchRubroId = (typeof PRELAUNCH_RUBRO_IDS)[number];

export type PrelaunchRubroFeature = {
  icon: string;
  title: string;
  text: string;
};

export type PrelaunchRubro = {
  title: string;
  tag: string;
  image: string;
  headline: string;
  why: string;
  features: PrelaunchRubroFeature[];
};

export const PRELAUNCH_RUBROS: Record<PrelaunchRubroId, PrelaunchRubro> = {
  peluqueria: {
    title: 'Peluquería',
    tag: 'Cortes y color sin estrés.',
    image: 'https://images.unsplash.com/photo-1560066984-138dadb4c035?auto=format&fit=crop&q=80&w=800',
    headline: 'Color y corte dejan de pelearse en la agenda.',
    why: 'En peluquería el problema no es “tener turnos”. Es mezclar servicios de 30 minutos con decoloraciones de 3 horas, sin que alguien que entra sin reserva te desordene el día.',
    features: [
      {
        icon: 'ri-time-line',
        title: 'Duraciones reales por servicio',
        text: 'Corte, brushing, color, mechas o tratamiento ocupan bloques distintos. Orvel muestra solo el hueco que entra.'
      },
      {
        icon: 'ri-scissors-cut-line',
        title: 'Bloqueos entre procesos',
        text: 'Reservá el tiempo de revelado o secado para no solapar sillas y no dejar a alguien esperando con el foil puesto.'
      },
      {
        icon: 'ri-chat-3-line',
        title: 'Menos “¿tenés lugar el jueves?”',
        text: 'El cliente ve disponibilidad y reserva color o corte sin mensajearte a mitad de un servicio.'
      },
      {
        icon: 'ri-door-open-line',
        title: 'Si entra alguien sin reserva',
        text: 'Lo cargás solo donde hay un hueco real. El día no se desarma y el color no se pisa.'
      }
    ]
  },
  unas: {
    title: 'Uñas',
    tag: 'Organización al minuto.',
    image: 'https://images.unsplash.com/photo-1522337660859-02fbefca4702?auto=format&fit=crop&q=80&w=800',
    headline: 'Cada servicio tiene su reloj. La agenda también.',
    why: 'Manicura, kapping, soft gel y nail art no duran lo mismo. Si la agenda trata todo como “uñas”, se te pisan las clientas y se te va el tiempo de limado.',
    features: [
      {
        icon: 'ri-timer-line',
        title: 'Minutos exactos por técnica',
        text: 'Definí duración de esmaltado, semipermanente, kapping o diseño. El link no ofrece un horario imposible.'
      },
      {
        icon: 'ri-sparkling-2-line',
        title: 'Margen de mesa y esterilización',
        text: 'Dejá un margen entre turnos para limpiar, cambiar fresa y no arrancar apurada con la siguiente.'
      },
      {
        icon: 'ri-stack-line',
        title: 'Combos sin adivinar',
        text: 'Manos + pies o diseño extra se reservan con el tiempo total. No improvisás sobre la marcha.'
      },
      {
        icon: 'ri-notification-3-line',
        title: 'Recordatorio antes del secado largo',
        text: 'Confirmaciones y avisos automáticos para que no te quede la mesa vacía 90 minutos.'
      }
    ]
  },
  barberia: {
    title: 'Barbería',
    tag: 'Reservas automáticas.',
    image: 'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?auto=format&fit=crop&q=80&w=800',
    headline: 'La silla gira. La libreta no tiene que hacerlo.',
    why: 'En barbería conviven el cliente de siempre que entra y espera, el que reserva fade + barba, y el mensaje a las 22. Orvel ordena eso sin volver el local una recepción de mensajes.',
    features: [
      {
        icon: 'ri-scissors-line',
        title: 'Cortes cortos y combos largos',
        text: 'Fade solo no ocupa lo mismo que corte + barba + cejas. Cada servicio bloquea su tiempo.'
      },
      {
        icon: 'ri-calendar-check-line',
        title: 'Sin reserva y con reserva, misma agenda',
        text: 'Si se libera un hueco, lo ves. Si alguien entra, lo anotás. Nadie se pisa el turno.'
      },
      {
        icon: 'ri-whatsapp-line',
        title: 'El WhatsApp deja de ser la recepción',
        text: 'El cliente reserva solo. Vos seguís cortando. Fuera de horario también se toma el turno.'
      },
      {
        icon: 'ri-user-unfollow-line',
        title: 'El que no viene no te come el sábado',
        text: 'Recordatorio por email para que el hueco del sábado no aparezca a último momento.'
      }
    ]
  },
  masajes: {
    title: 'Masajes',
    tag: 'Tiempo entre sesiones.',
    image: 'https://images.unsplash.com/photo-1544161515-4ab6ce6db874?auto=format&fit=crop&q=80&w=800',
    headline: 'El turno incluye lo que no se ve: cabina, cambio y silencio.',
    why: 'Un masaje de 60 minutos no es 60 minutos de agenda. Hay recepción, cambio de sábanas, ventilación y que la persona anterior no se cruce con la siguiente.',
    features: [
      {
        icon: 'ri-home-heart-line',
        title: 'Margen de cabina',
        text: 'Sumá 10–15 minutos de preparación entre sesiones. El sistema no vende el horario sucio.'
      },
      {
        icon: 'ri-time-line',
        title: '60, 75 o 90 sin solapes',
        text: 'Cada protocolo tiene su bloque. Relajante, descontracturante o piedras no se pisan.'
      },
      {
        icon: 'ri-volume-mute-line',
        title: 'Menos interrupciones',
        text: 'El cliente reserva y recibe confirmación. No te escriben a mitad de la sesión.'
      },
      {
        icon: 'ri-map-pin-line',
        title: 'Un local, una agenda clara',
        text: 'Horarios, descansos y bloqueos de sala en un solo lugar. El ambiente se mantiene, la operación también.'
      }
    ]
  }
};

type ViewTransitionDocument = Document & {
  startViewTransition?: (update: () => void) => { finished: Promise<unknown> };
};

function isRubroId(value: string | undefined): value is PrelaunchRubroId {
  return PRELAUNCH_RUBRO_IDS.includes(value as PrelaunchRubroId);
}

async function runViewTransition(doc: ViewTransitionDocument, update: () => void): Promise<void> {
  if (typeof doc.startViewTransition === 'function') {
    await doc.startViewTransition(update).finished;
    return;
  }

  update();
}

function setActiveTransitionNames(section: HTMLElement, id: PrelaunchRubroId | null): void {
  section.querySelectorAll<HTMLElement>('.rubro-thumb, [data-rubro-title]').forEach((element) => {
    element.style.viewTransitionName = 'none';
  });

  if (!id) return;

  const card = section.querySelector<HTMLElement>(`[data-rubro-id="${id}"]`);
  const image = card?.querySelector<HTMLElement>('.rubro-thumb');
  const title = card?.querySelector<HTMLElement>('[data-rubro-title]');
  if (image) image.style.viewTransitionName = 'rubro-image';
  if (title) title.style.viewTransitionName = 'rubro-title';
}

function renderRubroDetail(copy: HTMLElement, hero: HTMLElement | null, id: PrelaunchRubroId): void {
  const rubro = PRELAUNCH_RUBROS[id];

  if (hero) {
    hero.innerHTML = `
      <img src="${rubro.image}" alt="" class="rubro-vt-image" />
      <div class="absolute inset-0 bg-gradient-to-t from-bg-primary via-bg-primary/40 to-transparent"></div>
      <div class="absolute inset-x-0 bottom-0 p-6 z-10">
        <p class="text-[11px] uppercase tracking-[0.18em] text-primary-soft mb-2">Rubro</p>
        <h3 class="rubro-vt-title font-headline font-bold text-4xl md:text-5xl text-text-primary tracking-tight">${rubro.title}</h3>
      </div>
    `;
  }

  copy.innerHTML = `
    <h3 class="font-headline font-bold text-2xl md:text-3xl text-text-primary tracking-tight mb-3">${rubro.headline}</h3>
    <p class="text-text-secondary leading-relaxed mb-6">${rubro.why}</p>
    <div class="grid gap-3">
      ${rubro.features
        .map(
          (feature) => `
            <div class="grid grid-cols-[40px_1fr] gap-3 rounded-2xl border border-border p-3.5">
              <div class="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                <i class="${feature.icon} text-lg" aria-hidden="true"></i>
              </div>
              <div>
                <strong class="block text-sm text-text-primary mb-1">${feature.title}</strong>
                <span class="text-text-secondary text-sm leading-relaxed">${feature.text}</span>
              </div>
            </div>
          `
        )
        .join('')}
    </div>
  `;
}

export function initPrelaunchRubros(root: Document): void {
  const section = root.querySelector<HTMLElement>('[data-rubros-root]');
  const detail = section?.querySelector<HTMLElement>('[data-rubro-detail]');
  const copy = section?.querySelector<HTMLElement>('[data-rubro-copy]');
  const list = section?.querySelector<HTMLElement>('[data-rubro-list]');
  const hero = section?.querySelector<HTMLElement>('[data-rubro-hero]') ?? null;
  if (!section || !detail || !copy) return;

  const doc = root as ViewTransitionDocument;
  let openId: PrelaunchRubroId | null = null;

  const showDetail = (id: PrelaunchRubroId) => {
    renderRubroDetail(copy, hero, id);
    section.dataset.view = 'detail';
    detail.hidden = false;
    list?.setAttribute('hidden', '');
    openId = id;
  };

  const showList = () => {
    section.dataset.view = 'list';
    detail.hidden = true;
    list?.removeAttribute('hidden');
    openId = null;
  };

  const openRubro = async (id: PrelaunchRubroId) => {
    setActiveTransitionNames(section, id);
    await runViewTransition(doc, () => showDetail(id));
  };

  const closeRubro = async () => {
    const current = openId;
    await runViewTransition(doc, () => showList());
    if (current) setActiveTransitionNames(section, current);
  };

  section.addEventListener('click', (event) => {
    const target = event.target as HTMLElement | null;
    const card = target?.closest<HTMLElement>('[data-rubro-id]');
    if (card && isRubroId(card.dataset.rubroId) && section.contains(card) && !card.closest('[data-rubro-detail]')) {
      void openRubro(card.dataset.rubroId);
      return;
    }

    if (target?.closest('[data-rubro-back]')) {
      void closeRubro();
    }
  });
}
