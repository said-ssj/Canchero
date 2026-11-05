# Main Render build context: canchas-platform/apps/api.
FROM eclipse-temurin:21-jdk-jammy AS build
WORKDIR /app

# Copy Maven wrapper configuration and dependencies descriptor
COPY .mvn/ .mvn
COPY mvnw pom.xml ./
RUN sed -i 's/\r$//' mvnw && chmod +x mvnw

# Copy project source code and build jar
COPY src ./src
RUN --mount=type=cache,target=/root/.m2 ./mvnw clean package -B -DskipTests

# Runtime stage with lightweight JRE
FROM eclipse-temurin:21-jre-jammy
WORKDIR /app

# Copy executable jar from build stage
COPY --from=build /app/target/*.jar app.jar

# Spring reads Render's PORT; its local default is 8080.
EXPOSE 8080
USER 10001:10001

ENTRYPOINT ["java", "-jar", "/app/app.jar"]
