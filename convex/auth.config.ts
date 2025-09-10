const authConfig = {
  providers: [
    {
      // Using the Clerk issuer domain from the environment variable
      // This is configured in the Convex dashboard
      domain: process.env.CLERK_JWT_ISSUER_DOMAIN!,
      applicationID: "convex",
    },
  ],
};

export default authConfig;
