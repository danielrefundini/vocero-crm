import type { AgendaConnector } from "@/server/agenda/connectors/types";
import { googleMapsSearchUrl } from "@/lib/exteriors";

/**
 * Visita en casa. No habla con ningún proveedor: el "enlace" es una búsqueda
 * de Google Maps armada con la dirección. Sin dirección la cita se guarda
 * igual y el enlace queda pendiente.
 */
export const inHomeConnector: AgendaConnector<null> = {
  id: "in-home",
  requiresCredentials: false,

  async createMeeting(_creds, req) {
    return { externalId: null, joinUrl: googleMapsSearchUrl(req.location) };
  },

  async updateMeeting() {},

  async deleteMeeting() {},

  async testConnection() {
    return { ok: true, detail: "In-home visits do not use an external account." };
  },
};
