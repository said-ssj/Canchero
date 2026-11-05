package pe.canchero.backend.config;

import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.Statement;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.jdbc.core.ConnectionCallback;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import pe.canchero.backend.web.controller.HealthController;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class HealthControllerTest {
    @Test
    void returnsUpOnlyAfterBoundedReadOnlyProbe() throws Exception {
        var jdbc = mock(JdbcTemplate.class);
        var connection = mock(Connection.class);
        var statement = mock(Statement.class);
        var result = mock(ResultSet.class);
        when(connection.createStatement()).thenReturn(statement);
        when(statement.executeQuery("SELECT 1")).thenReturn(result);
        when(result.next()).thenReturn(true);
        when(result.getInt(1)).thenReturn(1);
        when(jdbc.execute(org.mockito.ArgumentMatchers.<ConnectionCallback<Boolean>>any()))
                .thenAnswer(call -> call.<ConnectionCallback<Boolean>>getArgument(0).doInConnection(connection));
        MockMvcBuilders.standaloneSetup(new HealthController(jdbc)).build().perform(get("/health"))
                .andExpect(status().isOk()).andExpect(content().json("{\"status\":\"UP\"}"));
        verify(statement).setQueryTimeout(2);
        verify(statement).executeQuery("SELECT 1");
        verify(statement).close();
        verify(result).close();
    }

    @Test
    void returnsUnavailableWithoutLeakingDatabaseDetails() throws Exception {
        var jdbc = mock(JdbcTemplate.class);
        when(jdbc.execute(org.mockito.ArgumentMatchers.<ConnectionCallback<Boolean>>any()))
                .thenThrow(new DataAccessResourceFailureException("private database credentials and address"));
        MockMvcBuilders.standaloneSetup(new HealthController(jdbc)).build().perform(get("/health"))
                .andExpect(status().isServiceUnavailable()).andExpect(content().json("{\"status\":\"DOWN\"}"));
    }

    @Test
    void doesNotReportHealthyForAnInvalidProbeResult() throws Exception {
        var jdbc = mock(JdbcTemplate.class);
        when(jdbc.execute(org.mockito.ArgumentMatchers.<ConnectionCallback<Boolean>>any())).thenReturn(false);
        MockMvcBuilders.standaloneSetup(new HealthController(jdbc)).build().perform(get("/health"))
                .andExpect(status().isServiceUnavailable()).andExpect(jsonPath("$.status").value("DOWN"));
    }
}
