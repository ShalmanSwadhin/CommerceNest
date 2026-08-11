FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
COPY packages ./packages
COPY apps/storefront ./apps/storefront
RUN npm install
WORKDIR /app/apps/storefront
# Pass at build time, e.g. --build-arg VITE_API_BASE_URL=https://api.example.com
# Do not default to localhost for production images.
ARG VITE_API_BASE_URL=
ARG VITE_STORE_SLUG=
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_STORE_SLUG=$VITE_STORE_SLUG
RUN npm run build

FROM nginx:1.27-alpine
COPY apps/storefront/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/storefront/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
