package com.plotchain.projects;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.math.BigDecimal;
import java.util.UUID;

@Entity
@Table(name = "plot")
public class Plot {

    @Id
    private UUID id;

    @Column(name = "project_id")
    private UUID projectId;

    @Column(name = "plot_no")
    private String plotNo;

    @Enumerated(EnumType.STRING)
    @Column(name = "plot_type")
    private PlotType plotType;

    @Column(name = "area_sqft")
    private BigDecimal areaSqft;

    @Column(name = "rate")
    private BigDecimal rate;

    @Column(name = "price")
    private BigDecimal price;

    @Enumerated(EnumType.STRING)
    @Column(name = "status")
    private PlotStatus status;

    protected Plot() {}

    public Plot(UUID id, UUID projectId, String plotNo, PlotType plotType,
                BigDecimal areaSqft, BigDecimal rate, BigDecimal price, PlotStatus status) {
        this.id = id;
        this.projectId = projectId;
        this.plotNo = plotNo;
        this.plotType = plotType;
        this.areaSqft = areaSqft;
        this.rate = rate;
        this.price = price;
        this.status = status;
    }

    public UUID getId() { return id; }
    public UUID getProjectId() { return projectId; }

    public String getPlotNo() { return plotNo; }
    public void setPlotNo(String plotNo) { this.plotNo = plotNo; }

    public PlotType getPlotType() { return plotType; }
    public void setPlotType(PlotType plotType) { this.plotType = plotType; }

    public BigDecimal getAreaSqft() { return areaSqft; }
    public void setAreaSqft(BigDecimal areaSqft) { this.areaSqft = areaSqft; }

    public BigDecimal getRate() { return rate; }
    public void setRate(BigDecimal rate) { this.rate = rate; }

    public BigDecimal getPrice() { return price; }
    public void setPrice(BigDecimal price) { this.price = price; }

    public PlotStatus getStatus() { return status; }
    public void setStatus(PlotStatus status) { this.status = status; }
}
