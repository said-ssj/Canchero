# 1. Etapa de compilación con JDK 17 y Maven
FROM eclipse-temurin:17-jdk-alpine AS build
WORKDIR /app

# Instalamos Maven en Alpine
RUN apk add --no-cache maven

# Copiamos todo el contenido de canchas-platform
COPY . .

# Compilamos apuntando directamente a apps/api/pom.xml
RUN mvn -f apps/api/pom.xml clean package -DskipTests

# 2. Etapa de ejecución ligera con JRE 17
FROM eclipse-temurin:17-jre-alpine
WORKDIR /app

# Copiamos el JAR generado desde apps/api/target/
COPY --from=build /app/apps/api/target/*.jar app.jar

EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]