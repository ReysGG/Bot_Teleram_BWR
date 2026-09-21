export const clerkAuthAppearance = {
  elements: {
    rootBox: {
      width: "100%",
      minWidth: "0",
      maxWidth: "430px",
    },
    cardBox: {
      width: "100%",
      minWidth: "0",
      maxWidth: "100%",
      overflow: "visible",
      boxShadow: "none",
    },
    card: {
      width: "100%",
      minWidth: "0",
      maxWidth: "100%",
      margin: "0",
      boxSizing: "border-box" as const,
      border: "0",
      borderRadius: "0",
      padding: "4px",
      background: "transparent",
      boxShadow: "none",
    },
    header: {
      padding: "0 0 1.25rem",
      textAlign: "center" as const,
    },
    headerTitle: {
      color: "#0a1736",
      fontSize: "1.85rem",
      fontWeight: "900",
      letterSpacing: "-0.035em",
    },
    headerSubtitle: {
      maxWidth: "25rem",
      margin: "0.5rem auto 0",
      color: "#64708a",
      fontSize: "0.88rem",
      lineHeight: "1.55",
    },
    socialButtonsBlockButton: {
      display: "none",
    },
    dividerRow: {
      display: "none",
    },
    main: {
      gap: "1rem",
    },
    formFieldLabel: {
      marginBottom: "0.45rem",
      color: "#0a1736",
      fontSize: "0.78rem",
      fontWeight: "800",
    },
    formFieldInput: {
      width: "100%",
      minWidth: "0",
      boxSizing: "border-box" as const,
      minHeight: "3.15rem",
      border: "1px solid #d6e1f1",
      borderRadius: "0.75rem",
      padding: "0 0.95rem",
      background: "#ffffff",
      color: "#0a1736",
      fontSize: "0.88rem",
      boxShadow: "0 3px 12px rgba(31, 72, 136, 0.04)",
    },
    formButtonPrimary: {
      minHeight: "3.15rem",
      borderRadius: "0.75rem",
      background: "linear-gradient(135deg, #1769ff, #2f88ff)",
      fontSize: "0.9rem",
      fontWeight: "850",
      boxShadow: "0 12px 28px rgba(23, 105, 255, 0.22)",
    },
    footer: {
      padding: "1.25rem 0 0",
      background: "transparent",
    },
    footerActionText: {
      color: "#64708a",
      fontSize: "0.78rem",
    },
    footerActionLink: {
      color: "#1769ff",
      fontSize: "0.78rem",
      fontWeight: "850",
    },
  },
};
