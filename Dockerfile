FROM node:20-alpine AS base

# Set a consistent working directory
WORKDIR /app

#
# Install dependencies using Yarn workspaces
#
FROM base AS deps

# Install system dependencies required for Next.js / sharp, etc.
RUN apk add --no-cache libc6-compat

# Copy root package manifests and Yarn Berry config first (for better caching)
COPY package.json yarn.lock .yarnrc.* ./
COPY .yarn ./.yarn

# Copy workspace package manifests so that Yarn can resolve workspaces
COPY packages/ ./packages/

# Install all workspace dependencies
RUN yarn install --immutable

#
# Build the Next.js app
#
FROM deps AS build

# Ensure production build
ENV NODE_ENV=production

# Build the Next.js workspace app
RUN yarn workspace @se-2/nextjs build

#
# Production runtime image
#
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

# Create a non-root user for security
RUN addgroup -S nodejs && adduser -S nextjs -G nodejs

# Copy only the files needed to run the built Next.js app

# Root workspace metadata (for runtime if needed)
COPY --from=deps /app/package.json ./package.json

# Copy the built Next.js app from the workspace
COPY --from=build /app/packages/nextjs/.next ./packages/nextjs/.next
COPY --from=build /app/packages/nextjs/public ./packages/nextjs/public
COPY --from=build /app/packages/nextjs/package.json ./packages/nextjs/package.json
COPY --from=build /app/packages/nextjs/next.config.js ./packages/nextjs/next.config.js
COPY --from=build /app/packages/nextjs/next-env.d.ts ./packages/nextjs/next-env.d.ts

# If your app relies on any runtime environment variables, they should be
# provided at container start via -e or docker-compose.

USER nextjs

# Use the workspace start script to run the production server
CMD ["yarn", "workspace", "@se-2/nextjs", "serve"]

