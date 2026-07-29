(() => {
  "use strict";

  const AGENT_ID = "agent_6801kyqt2krkfah81e7yghy0qvbx";
  const WIDGET_SOURCE = "https://unpkg.com/@elevenlabs/convai-widget-embed@0.14.11";

  function trackAssistantStart() {
    const eventData = {
      event_category: "engagement",
      event_label: "website_booking_assistant",
      page_path: window.location.pathname,
    };

    if (typeof window.gtag === "function") {
      window.gtag("event", "assistant_started", eventData);
    }

    if (typeof window.fbq === "function") {
      window.fbq("trackCustom", "AssistantStarted", eventData);
    }
  }

  function mountAssistant() {
    if (document.querySelector("elevenlabs-convai")) return;

    const assistant = document.createElement("elevenlabs-convai");
    assistant.setAttribute("agent-id", AGENT_ID);
    assistant.setAttribute("action-text", "Need help?");
    assistant.setAttribute("expand-text", "Open booking assistant");
    assistant.setAttribute("start-call-text", "Start chat");
    assistant.setAttribute("end-call-text", "End chat");
    assistant.setAttribute("dismissible", "true");
    assistant.setAttribute("avatar-orb-color-1", "#d21f26");
    assistant.setAttribute("avatar-orb-color-2", "#f4efe4");
    assistant.setAttribute("markdown-link-allowed-hosts", "tuffbrosdetailing.com");
    assistant.addEventListener("elevenlabs-convai:call", trackAssistantStart, { once: true });
    document.body.append(assistant);

    const widgetScript = document.createElement("script");
    widgetScript.src = WIDGET_SOURCE;
    widgetScript.async = true;
    document.head.append(widgetScript);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mountAssistant, { once: true });
  } else {
    mountAssistant();
  }
})();
