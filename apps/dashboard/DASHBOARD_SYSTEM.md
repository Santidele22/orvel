1. 🧠 System Purpose
purpose:
  - generate_dashboard_ui
  - select_relevant_metrics
  - adapt_copy_to_business_type
  - minimize_user_decision_load
2. 🎯 Business Types
business_types:
  - barber
  - beauty
  - wellness
  - tattoo
3. 📊 Core Metrics (ALWAYS INCLUDE)
core_metrics:
  - id: appointments_today
    label: "Turnos hoy"
    type: number

  - id: revenue_today
    label: "Ingresos hoy"
    type: currency

  - id: occupancy_rate
    label: "Ocupación"
    type: percentage

  - id: next_client
    label: "Próximo cliente"
    type: object
4. 🎭 Metrics by Business Type
🧔 barber
barber:
  focus: efficiency

  metrics:
    - occupancy_by_hour
    - avg_service_time
    - cancellations_today
    - revenue_today

  main_kpi: occupancy_rate

  insights:
    - "Tu agenda está {occupancy_rate}% llena"
    - "Quedan {available_slots} espacios hoy"
💅 beauty
beauty:
  focus: growth

  metrics:
    - new_clients
    - popular_services
    - returning_clients
    - revenue_today

  main_kpi: revenue_today

  insights:
    - "{new_clients} clientes nuevos hoy"
    - "Servicio más elegido: {top_service}"
🌿 wellness
wellness:
  focus: balance

  metrics:
    - available_time_remaining
    - avg_session_duration
    - satisfaction_score
    - occupancy_rate

  main_kpi: available_time_remaining

  insights:
    - "Te quedan {available_slots} sesiones disponibles"
    - "Día equilibrado 🌿"
🎨 tattoo
tattoo:
  focus: project_value

  metrics:
    - active_projects
    - projected_revenue
    - scheduled_hours
    - pending_sessions

  main_kpi: projected_revenue

  insights:
    - "Ingresos proyectados: ${projected_revenue}"
    - "{active_projects} proyectos activos"
5. 🧠 Smart Metrics (OPTIONAL BUT RECOMMENDED)
smart_metrics:
  - lost_slots
  - cancellation_rate
  - peak_hours
  - unrealized_revenue
6. 🧩 UI Structure
dashboard:
  layout:
    - main_agenda
    - right_panel

  right_panel:
    sections:
      - next_client
      - main_kpi
      - secondary_metrics
      - insight
7. 🧍 Next Client Object
next_client:
  fields:
    - name
    - service
    - time
    - status

  status_rules:
    - if < 15 minutes: "llega en breve"
    - if in_progress: "en sesión"
8. 📈 KPI Selection Rules
kpi_rules:
  - only_one_main_kpi: true
  - prioritize_real_time_data: true
  - must_be_actionable: true
9. 🧠 Insight Generation Rules
insight_rules:
  - max_insights: 1
  - must_include_dynamic_values: true
  - must_be_actionable: true
  - tone_must_match_template: true
10. 🎨 Tone by Business Type
tone:
  barber: "direct, efficient"
  beauty: "friendly, aesthetic"
  wellness: "calm, soft"
  tattoo: "bold, confident"
11. ⚙️ Generation Algorithm
function generateDashboard(businessType, data) {
  const core = getCoreMetrics(data);
  const specific = getBusinessMetrics(businessType, data);
  const kpi = selectMainKPI(businessType, data);
  const insight = generateInsight(businessType, data);

  return {
    core,
    specific,
    kpi,
    insight
  };
}
12. 🚫 Constraints (VERY IMPORTANT)
constraints:
  - max_total_metrics: 5
  - must_not_duplicate_metrics: true
  - must_not_mix_business_contexts: true
  - must_prioritize_clarity_over_quantity: true
13. 🧠 LLM Behavior Instructions
llm_rules:
  - do_not_show_all_metrics
  - always_prioritize_main_kpi
  - always_include_next_client
  - always_generate_contextual_text
  - never_use_generic_labels
14. 📦 Output Format
{
  "coreMetrics": [],
  "specificMetrics": [],
  "mainKPI": {},
  "nextClient": {},
  "insight": ""
}
🔥 Final Insight

This system is not a dashboard.

It is a decision engine for small businesses