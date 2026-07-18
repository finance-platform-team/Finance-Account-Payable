import { MicrosoftDataverseService } from "../generated/services/MicrosoftDataverseService";
import { AppmodulesService } from "../generated/services/AppmodulesService";

const ENVIRONMENT_FRIENDLY_NAME = "Digital Transformation Env";
const TMS_APP_NAME = "TMS App";
const TMS_WEB_RESOURCE = "tms_TMSView";
let cachedOrgUrl: string | null = null;
let cachedAppId: string | null = null;

async function getOrgUrl(): Promise<string | null> {
  if (cachedOrgUrl) return cachedOrgUrl;
  try {
    const res = await MicrosoftDataverseService.GetOrganizations();
    const orgs = res.data?.value || [];
    const match = orgs.find((o) => o.FriendlyName === ENVIRONMENT_FRIENDLY_NAME);
    const orgUrl = match?.Url || orgs[0]?.Url;
    if (!orgUrl) return null;
    cachedOrgUrl = orgUrl.replace(/\/$/, "");
    return cachedOrgUrl;
  } catch (err) {
    console.error("Error fetching organization URL:", err);
    return null;
  }
}

async function getTmsAppId(): Promise<string | null> {
  if (cachedAppId) return cachedAppId;
  try {
    const res = await AppmodulesService.getAll({
      select: ["appmoduleid", "name"],
      filter: `name eq '${TMS_APP_NAME}'`,
    });
    const rows = (res.data || []) as unknown as { appmoduleid: string; name: string }[];
    if (rows.length === 0) return null;
    cachedAppId = rows[0].appmoduleid;
    return cachedAppId;
  } catch (err) {
    console.error("Error fetching TMS App ID:", err);
    return null;
  }
}

export async function buildTmsTaskUrl(taskId?: string): Promise<string | null> {
  if (!taskId) return null;
  const [orgUrl, appId] = await Promise.all([getOrgUrl(), getTmsAppId()]);
  if (!orgUrl || !appId) return null;
  return `${orgUrl}/main.aspx?appid=${appId}&pagetype=webresource&webresourceName=${TMS_WEB_RESOURCE}`;

}