/**
 * Daily legal monitor. Re-checks each active case in DataJud, detects new
 * movements, updates the case and raises an alert so the household can follow
 * what happened. Also raises alerts for imminent deadlines/hearings.
 */
import * as db from "./db";
import { decryptSecret } from "./crypto";
import { lookupProcess } from "./datajud";

function movCount(json?: string | null): number {
  if (!json) return 0;
  try {
    const arr = JSON.parse(json);
    return Array.isArray(arr) ? arr.length : 0;
  } catch {
    return 0;
  }
}

function daysUntil(date?: string | null): number | null {
  if (!date) return null;
  const d = new Date(date + "T00:00:00").getTime();
  if (Number.isNaN(d)) return null;
  return Math.round((d - Date.now()) / 86400000);
}

/** Check one household's cases for updates; returns counts of changes/alerts. */
export async function checkHouseholdUpdates(householdId: number): Promise<{ updated: number; alerts: number }> {
  const cases = await db.getLegalCases(householdId);
  if (cases.length === 0) return { updated: 0, alerts: 0 };
  const row = await db.getIntegration(householdId, "datajud");
  const apiKey = row?.credentials ? decryptSecret(row.credentials) : "";

  let updated = 0;
  let alertsCreated = 0;
  for (const c of cases) {
    if (c.status !== "active") continue;
    const numero = (c.caseNumber ?? "").replace(/\D/g, "");

    // 1) New movements via DataJud (only for cases with a valid CNJ number).
    if (numero.length === 20) {
      let data: Record<string, string> | null = null;
      try {
        data = await lookupProcess(numero, apiKey);
      } catch {
        data = null;
      }
      if (data) {
        const before = movCount(c.movimentos);
        const after = movCount(data.movimentos);
        const changed = after > before || (!!data.ultimoAndamento && data.ultimoAndamento !== c.ultimoAndamento);
        if (changed) {
          await db.updateLegalCase(c.id, householdId, {
            court: data.orgaoJulgador || c.court,
            vara: data.orgaoJulgador || c.vara,
            classe: data.classe || c.classe,
            assunto: data.assunto || c.assunto,
            grau: data.grau || c.grau,
            dataDistribuicao: data.dataAjuizamento || c.dataDistribuicao,
            valorCausa: data.valorCausa || c.valorCausa,
            ultimoAndamento: data.ultimoAndamento || c.ultimoAndamento,
            movimentos: data.movimentos || c.movimentos,
            fonte: "datajud",
            lastSyncAt: new Date(),
          } as any);
          updated++;
          await db.createAlert({
            householdId,
            legalCaseId: c.id,
            type: "andamento",
            title: `Nova movimentação — ${c.title}`,
            message: data.ultimoAndamento || "Houve atualização no processo.",
          });
          alertsCreated++;
        }
      }
    }

    // 2) Imminent deadline / hearing (≤ 3 days), deduped per case+type.
    const prazo = daysUntil(c.nextDeadline);
    if (prazo != null && prazo >= 0 && prazo <= 3 && !(await db.hasRecentAlert(householdId, c.id, "prazo"))) {
      await db.createAlert({
        householdId, legalCaseId: c.id, type: "prazo",
        title: `Prazo em ${prazo} dia(s) — ${c.title}`,
        message: `Prazo em ${c.nextDeadline}. Verifique com o advogado.`,
      });
      alertsCreated++;
    }
    const aud = daysUntil(c.audiencia);
    if (aud != null && aud >= 0 && aud <= 3 && !(await db.hasRecentAlert(householdId, c.id, "audiencia"))) {
      await db.createAlert({
        householdId, legalCaseId: c.id, type: "audiencia",
        title: `Audiência em ${aud} dia(s) — ${c.title}`,
        message: `Audiência marcada para ${c.audiencia}.`,
      });
      alertsCreated++;
    }
  }
  return { updated, alerts: alertsCreated };
}

/** Run the monitor for every household (used by the scheduled job). */
export async function runDailyMonitor(): Promise<void> {
  try {
    const ids = await db.getAllHouseholdIds();
    for (const id of ids) {
      await checkHouseholdUpdates(id).catch((e) => console.error(`[Monitor] household ${id}:`, e));
    }
    console.log("[Monitor] daily legal check completed");
  } catch (err) {
    console.error("[Monitor] failed:", err);
  }
}

/** Schedule the daily monitor at 10:00 UTC (= 07:00 horário de Brasília). */
export function scheduleDailyMonitor(): void {
  const TARGET_UTC_HOUR = 10;
  const msUntilNext = () => {
    const now = new Date();
    const next = new Date(now);
    next.setUTCHours(TARGET_UTC_HOUR, 0, 0, 0);
    if (next.getTime() <= now.getTime()) next.setUTCDate(next.getUTCDate() + 1);
    return next.getTime() - now.getTime();
  };
  const arm = () => {
    setTimeout(async () => {
      await runDailyMonitor();
      arm();
    }, msUntilNext());
  };
  arm();
  console.log("[Monitor] daily legal monitor scheduled for 10:00 UTC (07:00 Brasília)");
}
