import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { Id } from "./_generated/dataModel";

export const createMockResume = mutation({
  args: {
    userEmail: v.string(),
  },
  handler: async (ctx, args) => {
    // Check if user already has a mock resume
    const existingResume = await ctx.db
      .query("resumes")
      .filter((q) => q.eq(q.field("userId"), args.userEmail))
      .filter((q) => q.eq(q.field("title"), "Karan Rai - Full Stack Software Engineer"))
      .first();

    if (existingResume) {
      return { message: "Mock resume already exists", resumeId: existingResume._id };
    }

    // Create the resume
    const resumeId = await ctx.db.insert("resumes", {
      userId: args.userEmail,
      title: "Karan Rai - Full Stack Software Engineer",
      description: "Experienced software engineer specializing in distributed systems, machine learning, and full-stack development. Passionate about building scalable solutions and leading technical teams.",
      isPublic: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // Project 1: E-Commerce Platform
    const project1Id = await ctx.db.insert("projects", {
      resumeId,
      title: "Distributed E-Commerce Platform",
      description: "Built a scalable microservices-based e-commerce platform handling 100K+ daily active users",
      position: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // Project 1 Bullet Points
    const bullet1_1 = await ctx.db.insert("bulletPoints", {
      projectId: project1Id,
      content: "Designed and implemented a microservices architecture using Node.js, Docker, and Kubernetes",
      position: 0,
      hasBranches: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    await ctx.db.insert("branches", {
      type: "text",
      position: 0,
      bulletPointId: bullet1_1,
      content: "Implemented service mesh using Istio for inter-service communication, achieving 99.9% uptime and reducing latency by 40%. Used circuit breakers and retry logic to handle failures gracefully.",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    await ctx.db.insert("branches", {
      type: "text",
      position: 1,
      bulletPointId: bullet1_1,
      content: "Containerized 12 microservices using Docker, created Helm charts for Kubernetes deployments, and set up automated rolling updates with zero downtime deployments.",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const bullet1_2 = await ctx.db.insert("bulletPoints", {
      projectId: project1Id,
      content: "Developed real-time inventory management system with Redis and PostgreSQL",
      position: 1,
      hasBranches: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    await ctx.db.insert("branches", {
      type: "text",
      position: 0,
      bulletPointId: bullet1_2,
      content: "Implemented CQRS pattern with event sourcing to separate read and write operations, using Redis for caching hot data and PostgreSQL for persistent storage with read replicas.",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    await ctx.db.insert("branches", {
      type: "text",
      position: 1,
      bulletPointId: bullet1_2,
      content: "Built real-time stock updates using WebSockets and Redis Pub/Sub, processing 10,000+ inventory updates per minute with sub-100ms latency.",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const bullet1_3 = await ctx.db.insert("bulletPoints", {
      projectId: project1Id,
      content: "Implemented payment processing integration with Stripe and PayPal APIs",
      position: 2,
      hasBranches: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    await ctx.db.insert("branches", {
      type: "text",
      position: 0,
      bulletPointId: bullet1_3,
      content: "Created PCI-compliant payment gateway abstraction layer supporting multiple providers, implementing tokenization and 3D Secure authentication for enhanced security.",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const bullet1_4 = await ctx.db.insert("bulletPoints", {
      projectId: project1Id,
      content: "Reduced page load time by 60% through code splitting and lazy loading",
      position: 3,
      hasBranches: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    await ctx.db.insert("branches", {
      type: "text",
      position: 0,
      bulletPointId: bullet1_4,
      content: "Implemented React.lazy() and Suspense for component-level code splitting, reducing initial bundle size from 2.3MB to 450KB. Used webpack bundle analyzer to identify and eliminate duplicate dependencies.",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // Project 2: Machine Learning Pipeline
    const project2Id = await ctx.db.insert("projects", {
      resumeId,
      title: "Real-Time Fraud Detection System",
      description: "Developed ML pipeline for credit card fraud detection processing 1M+ transactions daily",
      position: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const bullet2_1 = await ctx.db.insert("bulletPoints", {
      projectId: project2Id,
      content: "Built end-to-end ML pipeline using Apache Spark and Kafka for real-time processing",
      position: 0,
      hasBranches: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    await ctx.db.insert("branches", {
      type: "text",
      position: 0,
      bulletPointId: bullet2_1,
      content: "Designed Kafka streaming architecture with 5 topics and custom partitioning strategy, achieving 50ms p99 latency for fraud scoring. Implemented exactly-once semantics using Kafka transactions.",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    await ctx.db.insert("branches", {
      type: "text",
      position: 1,
      bulletPointId: bullet2_1,
      content: "Pioneered advanced feature engineering approach computing 30+ real-time behavioral signals including velocity checks, geo-location anomalies, and device fingerprinting - going beyond traditional rule-based systems to capture subtle fraud patterns that reduced manual review queues by 40%.",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const bullet2_2 = await ctx.db.insert("bulletPoints", {
      projectId: project2Id,
      content: "Trained ensemble model achieving 99.2% precision and 94% recall on fraud detection",
      position: 1,
      hasBranches: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    await ctx.db.insert("branches", {
      type: "text",
      position: 0,
      bulletPointId: bullet2_2,
      content: "Combined XGBoost, Random Forest, and Neural Network models using stacking ensemble technique. Implemented SMOTE for handling class imbalance (0.1% fraud rate) and used Bayesian optimization for hyperparameter tuning.",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    await ctx.db.insert("branches", {
      type: "text",
      position: 1,
      bulletPointId: bullet2_2,
      content: "Deployed models using TensorFlow Serving with A/B testing framework, monitoring model drift using PSI (Population Stability Index) and triggering automated retraining when threshold exceeded.",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const bullet2_3 = await ctx.db.insert("bulletPoints", {
      projectId: project2Id,
      content: "Implemented feature store using Feast for consistent feature computation",
      position: 2,
      hasBranches: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    await ctx.db.insert("branches", {
      type: "text",
      position: 0,
      bulletPointId: bullet2_3,
      content: "Designed online and offline feature stores using Redis and S3, ensuring feature consistency between training and serving. Implemented feature versioning and lineage tracking for reproducibility.",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const bullet2_4 = await ctx.db.insert("bulletPoints", {
      projectId: project2Id,
      content: "Achieved industry-leading 35% false positive reduction while maintaining 99.2% fraud catch rate",
      position: 3,
      hasBranches: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    await ctx.db.insert("branches", {
      type: "text",
      position: 0,
      bulletPointId: bullet2_4,
      content: "Transformed fraud detection accuracy by introducing behavioral biometrics and graph-based network analysis - a departure from traditional transaction-only models. This holistic approach identified sophisticated fraud rings that previous rule-based systems missed, saving $2M+ annually in false decline losses while improving customer experience.",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // Project 3: Developer Tools
    const project3Id = await ctx.db.insert("projects", {
      resumeId,
      title: "Cloud-Native CI/CD Platform",
      description: "Created automated deployment platform reducing deployment time from hours to minutes",
      position: 2,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const bullet3_1 = await ctx.db.insert("bulletPoints", {
      projectId: project3Id,
      content: "Architected GitOps-based deployment pipeline using ArgoCD and GitHub Actions",
      position: 0,
      hasBranches: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    await ctx.db.insert("branches", {
      type: "text",
      position: 0,
      bulletPointId: bullet3_1,
      content: "Implemented declarative infrastructure using Terraform with remote state management in S3. Created reusable modules for common infrastructure patterns across 50+ microservices.",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    await ctx.db.insert("branches", {
      type: "text",
      position: 1,
      bulletPointId: bullet3_1,
      content: "Set up progressive delivery using Flagger for canary deployments, automatically rolling back based on Prometheus metrics (error rate, latency, custom business metrics).",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const bullet3_2 = await ctx.db.insert("bulletPoints", {
      projectId: project3Id,
      content: "Built comprehensive monitoring stack with Prometheus, Grafana, and ELK",
      position: 1,
      hasBranches: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    await ctx.db.insert("branches", {
      type: "text",
      position: 0,
      bulletPointId: bullet3_2,
      content: "Created 40+ Grafana dashboards with RED metrics (Rate, Errors, Duration) and custom business KPIs. Implemented log aggregation pipeline processing 100GB+ logs daily with Elasticsearch.",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    await ctx.db.insert("branches", {
      type: "text",
      position: 1,
      bulletPointId: bullet3_2,
      content: "Developed distributed tracing using Jaeger, correlating traces across 20+ services. Reduced MTTR by 60% through automated root cause analysis using trace analytics.",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const bullet3_3 = await ctx.db.insert("bulletPoints", {
      projectId: project3Id,
      content: "Implemented security scanning in CI pipeline using Snyk and SonarQube",
      position: 2,
      hasBranches: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    await ctx.db.insert("branches", {
      type: "text",
      position: 0,
      bulletPointId: bullet3_3,
      content: "Integrated SAST, DAST, and dependency scanning into build pipeline, failing builds on critical vulnerabilities. Achieved 100% coverage for security scanning across all repositories.",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // Project 4: Open Source Contribution
    const project4Id = await ctx.db.insert("projects", {
      resumeId,
      title: "Open Source Database Query Optimizer",
      description: "Contributing to popular open-source distributed SQL database engine",
      position: 3,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const bullet4_1 = await ctx.db.insert("bulletPoints", {
      projectId: project4Id,
      content: "Optimized query planner reducing execution time by 45% for complex JOIN operations",
      position: 0,
      hasBranches: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    await ctx.db.insert("branches", {
      type: "text",
      position: 0,
      bulletPointId: bullet4_1,
      content: "Implemented cost-based optimizer using dynamic programming for join ordering, considering statistics like cardinality, selectivity, and data distribution. Added histogram-based selectivity estimation.",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    await ctx.db.insert("branches", {
      type: "text",
      position: 1,
      bulletPointId: bullet4_1,
      content: "Developed adaptive query execution that re-optimizes queries at runtime based on actual vs estimated cardinalities, particularly effective for queries with parameter markers.",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const bullet4_2 = await ctx.db.insert("bulletPoints", {
      projectId: project4Id,
      content: "Implemented distributed transaction coordinator supporting ACID guarantees",
      position: 1,
      hasBranches: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    await ctx.db.insert("branches", {
      type: "text",
      position: 0,
      bulletPointId: bullet4_2,
      content: "Built two-phase commit protocol with automatic failure recovery and deadlock detection. Implemented MVCC (Multi-Version Concurrency Control) for snapshot isolation level.",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const bullet4_3 = await ctx.db.insert("bulletPoints", {
      projectId: project4Id,
      content: "Added support for window functions and CTEs (Common Table Expressions)",
      position: 2,
      hasBranches: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    await ctx.db.insert("branches", {
      type: "text",
      position: 0,
      bulletPointId: bullet4_3,
      content: "Implemented sliding window algorithm for efficient computation of moving aggregates. Optimized memory usage for large window frames using segment trees and circular buffers.",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    return { 
      message: "Mock resume created successfully", 
      resumeId,
      projectCount: 4,
      bulletPointCount: 14,
      branchCount: 21
    };
  },
});